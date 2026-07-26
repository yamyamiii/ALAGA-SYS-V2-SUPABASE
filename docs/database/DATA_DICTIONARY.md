# Data dictionary through Phase 3B

All timestamps are `timestamptz` in UTC storage. UUID values are internal keys;
display numbers are database-generated text. Nullable means the value may be
unknown, not collected, not applicable, or not yet linked as described.

Phase 3B adds no healthcare tables or columns. It activates the existing
`residents.photo_path` and `residents.linked_profile_id` fields through private
storage and trusted workflows, and adds functions, policies, triggers, and an
identity-search index.

## Phase 3B operational objects

| Object                               | Kind                   | Meaning                                                   |
| ------------------------------------ | ---------------------- | --------------------------------------------------------- |
| `resident-photos`                    | Private Storage bucket | JPEG/PNG/WebP resident images, 5 MB maximum               |
| `resident_photo_object_resident_id`  | Function               | Strict UUID-path parser                                   |
| `can_view_resident_photo`            | Function               | Storage read authorization bound to resident/profile      |
| `can_manage_resident_photo`          | Function               | Admin/BHW storage mutation authorization                  |
| `registry_search_households`         | Invoker RPC            | Paginated current household picker                        |
| `registry_find_resident_duplicates`  | Invoker RPC            | RLS-safe probable identity matches                        |
| `registry_record_duplicate_override` | RPC                    | Safe explicit-override audit event                        |
| `admin_*_resident_*`                 | Trusted RPCs           | Service-role-only candidate/status/link/unlink operations |

`residents.photo_path` contains only `<resident UUID>/<object UUID>.<extension>`.
It is never a signed URL. `linked_profile_id` remains a nullable unique foreign
key to a resident-role `profiles` row; direct browser changes are rejected.

## Enum types

| Type                    | Values                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------- |
| `app_role`              | `admin`, `barangay_health_worker`, `nurse`, `midwife`, `resident`                                       |
| `account_status`        | `invited`, `active`, `inactive`, `suspended`                                                            |
| `resident_status`       | `active`, `inactive`, `moved_out`, `deceased`, `archived`                                               |
| `sex_type`              | `male`, `female`                                                                                        |
| `household_status`      | `active`, `inactive`, `archived`                                                                        |
| `civil_status_type`     | `single`, `married`, `widowed`, `separated`, `annulled`                                                 |
| `pregnancy_status_type` | `not_pregnant`, `pregnant`, `postpartum`, `unknown`                                                     |
| `appointment_type`      | `scheduled`, `walk_in`, `follow_up`, `home_visit`                                                       |
| `appointment_status`    | `pending`, `confirmed`, `checked_in`, `in_progress`, `completed`, `cancelled`, `no_show`, `rescheduled` |
| `appointment_priority`  | `normal`, `priority`, `urgent`                                                                          |

## `profiles`

One-to-one application identity for a Supabase Auth user. Email is intentionally
not mirrored.

| Column               | Type             | Nullable/default     | Meaning                                            |
| -------------------- | ---------------- | -------------------- | -------------------------------------------------- |
| `id`                 | `uuid`           | Not null             | PK and FK to `auth.users.id`                       |
| `role`               | `app_role`       | Not null; `resident` | Authorization role                                 |
| `first_name`         | `text`           | Nullable             | Given name, 1–100 trimmed characters when present  |
| `middle_name`        | `text`           | Nullable             | Middle name, 1–100 characters                      |
| `last_name`          | `text`           | Nullable             | Family name, 1–100 characters                      |
| `suffix`             | `text`           | Nullable             | Name suffix, maximum 30 characters                 |
| `phone_number`       | `text`           | Nullable             | Contact number, 7–30 characters                    |
| `account_status`     | `account_status` | Not null; `invited`  | Account lifecycle state                            |
| `avatar_path`        | `text`           | Nullable             | Storage path, maximum 500 characters               |
| `last_login_at`      | `timestamptz`    | Nullable             | Trusted-workflow login timestamp                   |
| `created_at`         | `timestamptz`    | Not null; `now()`    | Creation timestamp                                 |
| `updated_at`         | `timestamptz`    | Not null; `now()`    | Trigger-maintained update timestamp                |
| `invited_by`         | `uuid`           | Nullable             | Trusted inviter profile FK; never browser-writable |
| `invitation_sent_at` | `timestamptz`    | Nullable             | Latest successful invitation send time             |
| `status_changed_at`  | `timestamptz`    | Not null; `now()`    | Trusted lifecycle-change timestamp                 |

## `barangays`

Locality reference table; the schema supports more than one barangay.

| Column                 | Type          | Nullable/default         | Meaning                             |
| ---------------------- | ------------- | ------------------------ | ----------------------------------- |
| `id`                   | `uuid`        | Not null; generated UUID | PK                                  |
| `name`                 | `text`        | Not null                 | Barangay name, 1–150 characters     |
| `city_or_municipality` | `text`        | Not null                 | Municipality/city, 1–150 characters |
| `province`             | `text`        | Not null                 | Province, 1–150 characters          |
| `is_active`            | `boolean`     | Not null; `true`         | Active reference-data flag          |
| `created_at`           | `timestamptz` | Not null; `now()`        | Creation timestamp                  |
| `updated_at`           | `timestamptz` | Not null; `now()`        | Trigger-maintained update timestamp |

Case-insensitive `(province, city_or_municipality, name)` is unique.

## `puroks`

Barangay subdivision reference table.

| Column        | Type          | Nullable/default         | Meaning                                        |
| ------------- | ------------- | ------------------------ | ---------------------------------------------- |
| `id`          | `uuid`        | Not null; generated UUID | PK                                             |
| `barangay_id` | `uuid`        | Not null                 | FK to `barangays.id`                           |
| `name`        | `text`        | Not null                 | Purok name, 1–100 characters                   |
| `code`        | `text`        | Not null                 | Uppercase code matching the documented pattern |
| `is_active`   | `boolean`     | Not null; `true`         | Active reference-data flag                     |
| `created_at`  | `timestamptz` | Not null; `now()`        | Creation timestamp                             |
| `updated_at`  | `timestamptz` | Not null; `now()`        | Trigger-maintained update timestamp            |

Name and code are each case-insensitively unique inside a barangay. The
additional unique `(id, barangay_id)` key supports composite locality FKs.

## `households`

Physical household and locality assignment.

| Column             | Type               | Nullable/default            | Meaning                                      |
| ------------------ | ------------------ | --------------------------- | -------------------------------------------- |
| `id`               | `uuid`             | Not null; generated UUID    | PK                                           |
| `household_number` | `text`             | Not null; trigger generated | Immutable unique `HH-YYYY-NNNNNN` identifier |
| `barangay_id`      | `uuid`             | Not null                    | FK to `barangays.id`                         |
| `purok_id`         | `uuid`             | Not null                    | Composite FK with barangay to `puroks`       |
| `address_line`     | `text`             | Not null                    | Address description, 1–500 characters        |
| `latitude`         | `numeric(9,6)`     | Nullable                    | Future compatibility; not used by frontend   |
| `longitude`        | `numeric(10,6)`    | Nullable                    | Future compatibility; not used by frontend   |
| `head_resident_id` | `uuid`             | Nullable                    | Household-member FK added after residents    |
| `status`           | `household_status` | Not null; `active`          | Household lifecycle state                    |
| `created_at`       | `timestamptz`      | Not null; `now()`           | Creation timestamp                           |
| `updated_at`       | `timestamptz`      | Not null; `now()`           | Trigger-maintained update timestamp          |
| `archived_at`      | `timestamptz`      | Nullable                    | Required exactly when status is `archived`   |

`household_number` is generated as `HH-YYYY-NNNNNN`. Unique
`(id, barangay_id, purok_id)` supports resident location consistency.

## `residents`

Resident demographic record. It is not an Auth identity and contains no stored
age column.

| Column                           | Type                    | Nullable/default            | Meaning                                                            |
| -------------------------------- | ----------------------- | --------------------------- | ------------------------------------------------------------------ |
| `id`                             | `uuid`                  | Not null; generated UUID    | PK                                                                 |
| `resident_number`                | `text`                  | Not null; trigger generated | Immutable unique `RES-YYYY-NNNNNN` identifier                      |
| `linked_profile_id`              | `uuid`                  | Nullable, unique            | Optional FK to one `profiles.id`                                   |
| `household_id`                   | `uuid`                  | Nullable                    | Optional household FK with matching locality                       |
| `barangay_id`                    | `uuid`                  | Not null                    | FK to `barangays.id`                                               |
| `purok_id`                       | `uuid`                  | Not null                    | Composite FK with barangay to `puroks`                             |
| `first_name`                     | `text`                  | Not null                    | Given name, 1–100 characters                                       |
| `middle_name`                    | `text`                  | Nullable                    | Middle name, 1–100 characters                                      |
| `last_name`                      | `text`                  | Not null                    | Family name, 1–100 characters                                      |
| `suffix`                         | `text`                  | Nullable                    | Suffix, maximum 30 characters                                      |
| `date_of_birth`                  | `date`                  | Not null                    | Date from 1900-01-01 through insertion/update date                 |
| `sex`                            | `sex_type`              | Not null                    | Validated sex value required by current scope                      |
| `civil_status`                   | `civil_status_type`     | Nullable                    | Validated civil status                                             |
| `blood_type`                     | `text`                  | Nullable                    | A/B/AB/O with Rh sign, or `unknown`                                |
| `nationality`                    | `text`                  | Nullable                    | Demographic nationality                                            |
| `religion`                       | `text`                  | Nullable                    | Optional demographic religion                                      |
| `phone_number`                   | `text`                  | Nullable                    | Contact number, 7–30 characters                                    |
| `email`                          | `text`                  | Nullable                    | Contact email, 3–254 characters; not a relationship                |
| `occupation`                     | `text`                  | Nullable                    | Occupation description                                             |
| `address_line`                   | `text`                  | Nullable                    | Optional resident address; household relationship is authoritative |
| `philhealth_number`              | `text`                  | Nullable                    | Non-primary PhilHealth reference, 1–50 characters                  |
| `emergency_contact_name`         | `text`                  | Nullable                    | Emergency contact name                                             |
| `emergency_contact_number`       | `text`                  | Nullable                    | Emergency contact number                                           |
| `emergency_contact_relationship` | `text`                  | Nullable                    | Relationship description                                           |
| `is_senior_citizen`              | `boolean`               | Not null; `false`           | Program flag, not derived age storage                              |
| `is_pwd`                         | `boolean`               | Not null; `false`           | PWD program flag                                                   |
| `pregnancy_status`               | `pregnancy_status_type` | Nullable                    | Validated female-only state; null is uncaptured/not applicable     |
| `status`                         | `resident_status`       | Not null; `active`          | Resident lifecycle state                                           |
| `photo_path`                     | `text`                  | Nullable                    | Future protected storage path                                      |
| `created_by`                     | `uuid`                  | Nullable                    | FK to creating profile                                             |
| `updated_by`                     | `uuid`                  | Nullable                    | FK to last updating profile                                        |
| `created_at`                     | `timestamptz`           | Not null; `now()`           | Creation timestamp                                                 |
| `updated_at`                     | `timestamptz`           | Not null; `now()`           | Trigger-maintained update timestamp                                |
| `archived_at`                    | `timestamptz`           | Nullable                    | Required for `moved_out` or `deceased`                             |

The database prevents pregnancy status for a male row, future/impossibly old
birth dates, cross-location household assignment, mutable resident numbers, and
multiple residents linked to one profile. BHW writes cannot create or replace the
profile link because that relationship grants resident self-read access.

## `appointments`

Operational scheduling only; it must not contain diagnoses or clinical notes.

| Column                | Type                   | Nullable/default            | Meaning                                                 |
| --------------------- | ---------------------- | --------------------------- | ------------------------------------------------------- |
| `id`                  | `uuid`                 | Not null; generated UUID    | PK                                                      |
| `appointment_number`  | `text`                 | Not null; trigger generated | Immutable unique `APT-YYYY-NNNNNN` identifier           |
| `resident_id`         | `uuid`                 | Not null                    | FK to `residents.id`                                    |
| `assigned_staff_id`   | `uuid`                 | Nullable                    | FK to assigned `profiles.id`                            |
| `appointment_type`    | `appointment_type`     | Not null                    | Scheduling origin/type                                  |
| `service_type`        | `varchar(100)`         | Not null                    | Validated administrable service label                   |
| `scheduled_date`      | `date`                 | Not null                    | Scheduled local calendar date                           |
| `start_time`          | `time`                 | Not null                    | Local start time                                        |
| `end_time`            | `time`                 | Not null                    | Local end time; must be later than start                |
| `priority`            | `appointment_priority` | Not null; `normal`          | Queue priority                                          |
| `status`              | `appointment_status`   | Not null; `pending`         | Operational state                                       |
| `reason`              | `text`                 | Nullable                    | Non-clinical booking reason, maximum 1,000 characters   |
| `operational_notes`   | `text`                 | Nullable                    | Scheduling/queue note, maximum 2,000 characters         |
| `cancellation_reason` | `text`                 | Nullable                    | Required for cancelled status; maximum 1,000 characters |
| `rescheduled_from_id` | `uuid`                 | Nullable                    | Self-FK to earlier appointment, never self              |
| `checked_in_at`       | `timestamptz`          | Nullable                    | Required from checked-in through completed              |
| `started_at`          | `timestamptz`          | Nullable                    | Required for in-progress/completed                      |
| `completed_at`        | `timestamptz`          | Nullable                    | Present exactly for completed status                    |
| `cancelled_at`        | `timestamptz`          | Nullable                    | Present exactly for cancelled status                    |
| `created_by`          | `uuid`                 | Nullable                    | FK to creating profile                                  |
| `updated_by`          | `uuid`                 | Nullable                    | FK to last updating profile                             |
| `created_at`          | `timestamptz`          | Not null; `now()`           | Creation timestamp                                      |
| `updated_at`          | `timestamptz`          | Not null; `now()`           | Trigger-maintained update timestamp                     |
| `archived_at`         | `timestamptz`          | Nullable                    | Soft archival timestamp                                 |
| `version`             | `bigint`               | Not null; `1`               | Optimistic concurrency version, bumped on every update  |
| `request_key`         | `uuid`                 | Nullable; unique when set   | Idempotency key for trusted create/reschedule RPCs      |

Resident names/contact details are not copied. Schedule-conflict handling and
state-transition APIs are implemented by trusted Phase 4 RPCs. Assignment is
limited to an active eligible staff profile; overlapping staff intervals are
serialized by staff/date, and direct authenticated inserts/updates are denied.

## `admin_action_rate_limits`

Internal Phase 2B abuse-control state. RLS is enabled and no browser role has a
policy or grant.

| Column              | Type          | Nullable/default   | Meaning                                |
| ------------------- | ------------- | ------------------ | -------------------------------------- |
| `actor_profile_id`  | `uuid`        | Not null           | PK and FK to the administrator profile |
| `window_started_at` | `timestamptz` | Not null           | Start of the current request window    |
| `request_count`     | `integer`     | Not null; positive | Atomic requests consumed in the window |

## `audit_logs`

Append-only record of controlled changes.

| Column             | Type          | Nullable/default         | Meaning                                                       |
| ------------------ | ------------- | ------------------------ | ------------------------------------------------------------- |
| `id`               | `uuid`        | Not null; generated UUID | PK                                                            |
| `actor_profile_id` | `uuid`        | Nullable                 | Restrictive FK to caller profile when resolvable              |
| `action`           | `text`        | Not null                 | Lowercase action identifier, maximum 64 characters            |
| `entity_type`      | `text`        | Not null                 | Lowercase source type/table, maximum 64 characters            |
| `entity_id`        | `uuid`        | Nullable                 | Source row ID; polymorphic, not an FK                         |
| `summary`          | `text`        | Not null                 | Human-readable summary, 1–500 characters                      |
| `old_values`       | `jsonb`       | Nullable                 | Whitelisted pre-change object                                 |
| `new_values`       | `jsonb`       | Nullable                 | Whitelisted post-change object                                |
| `request_metadata` | `jsonb`       | Nullable                 | Safe metadata; registry updates list changed field names only |
| `created_at`       | `timestamptz` | Not null; `now()`        | Immutable event time                                          |

## Index inventory

Primary keys and unique constraints automatically create indexes. Additional
indexes are:

| Table          | Index                                   | Columns/predicate                         |
| -------------- | --------------------------------------- | ----------------------------------------- |
| `profiles`     | `profiles_role_status_idx`              | `(role, account_status)`                  |
| `profiles`     | `profiles_invited_by_idx`               | Non-null inviter FK                       |
| `profiles`     | `profiles_status_changed_at_idx`        | Status + descending lifecycle timestamp   |
| `barangays`    | `barangays_locality_name_unique`        | Lowercased province/locality/name; unique |
| `puroks`       | `puroks_barangay_name_unique`           | Barangay + lower name; unique             |
| `puroks`       | `puroks_barangay_code_unique`           | Barangay + lower code; unique             |
| `puroks`       | `puroks_barangay_id_idx`                | Barangay FK                               |
| `households`   | `households_barangay_id_idx`            | Barangay FK                               |
| `households`   | `households_purok_id_idx`               | Purok FK                                  |
| `households`   | `households_head_resident_id_idx`       | Non-null head FK                          |
| `households`   | `households_active_location_idx`        | Active barangay/purok/number lookup       |
| `households`   | `households_registry_filter_idx`        | Status/locality/descending creation       |
| `residents`    | `residents_household_id_idx`            | Non-null household FK                     |
| `residents`    | `residents_barangay_id_idx`             | Barangay FK                               |
| `residents`    | `residents_purok_id_idx`                | Purok FK                                  |
| `residents`    | `residents_created_by_idx`              | Non-null creator FK                       |
| `residents`    | `residents_updated_by_idx`              | Non-null updater FK                       |
| `residents`    | `residents_active_name_idx`             | Active locality + lower family/given name |
| `residents`    | `residents_status_idx`                  | Status + barangay                         |
| `residents`    | `residents_registry_filter_idx`         | Status/locality/descending creation       |
| `residents`    | `residents_registry_classification_idx` | Current senior/PWD filters                |
| `appointments` | `appointments_scheduled_date_idx`       | Date                                      |
| `appointments` | `appointments_status_idx`               | Status                                    |
| `appointments` | `appointments_resident_id_idx`          | Resident + descending date                |
| `appointments` | `appointments_assigned_staff_id_idx`    | Active staff/date/time                    |
| `appointments` | `appointments_rescheduled_from_id_idx`  | Non-null self-FK                          |
| `appointments` | `appointments_created_by_idx`           | Non-null creator FK                       |
| `appointments` | `appointments_updated_by_idx`           | Non-null updater FK                       |
| `appointments` | `appointments_active_queue_idx`         | Active date/status/priority/start time    |
| `audit_logs`   | `audit_logs_actor_created_idx`          | Non-null actor + descending time          |
| `audit_logs`   | `audit_logs_entity_created_idx`         | Entity type/ID + descending time          |
| `audit_logs`   | `audit_logs_created_at_idx`             | Descending event time                     |
