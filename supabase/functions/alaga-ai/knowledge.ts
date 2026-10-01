export type SystemKnowledgeTopic =
  | "appointment_workflow"
  | "own_appointment_status"
  | "announcement"
  | "health_center"
  | "faq"
  | "service_schedule"
  | "registration"
  | "notifications"
  | "inquiries"
  | "reports"
  | "resident_registry"
  | "health_records"
  | "user_management"
  | "account_management"
  | "navigation"
  | "alaga_ai"
  | "general_system";

export type KnowledgeRole =
  "admin" | "barangay_health_worker" | "nurse" | "midwife" | "resident";

export type AppointmentWorkflowFacet =
  | "how_to_request"
  | "where_to_request"
  | "approval_behavior"
  | "what_happens_next"
  | "reschedule"
  | "cancel"
  | "status_meaning"
  | "staff_review"
  | "general_workflow";

type LocalizedKnowledge = {
  english: string;
  filipino: string;
};

export type SystemKnowledgeEntry = {
  id: string;
  topic: SystemKnowledgeTopic;
  title: string;
  aliases: readonly string[];
  keywords: readonly string[];
  facts: LocalizedKnowledge;
  answerFacets?: Partial<
    Readonly<Record<AppointmentWorkflowFacet, LocalizedKnowledge>>
  >;
  access?: LocalizedKnowledge;
  actionId?: string;
  actionRoles?: readonly KnowledgeRole[];
};

export type BarangayHealthServiceScheduleEntry = {
  id:
    | "general_consultation"
    | "pregnancy_services"
    | "maternal_care"
    | "immunization"
    | "family_planning"
    | "postpartum_care";
  service: string;
  serviceFilipino: string;
  schedule: string;
  scheduleFilipino: string;
  clarification?: string;
  clarificationFilipino?: string;
  patterns: readonly RegExp[];
};

export const BAGONGPOOK_HEALTH_SERVICE_SCHEDULE = Object.freeze<
  readonly BarangayHealthServiceScheduleEntry[]
>([
  {
    id: "general_consultation",
    service: "General Consultation",
    serviceFilipino: "General Consultation",
    schedule:
      "available on regular service days/every day under current barangay practice",
    scheduleFilipino:
      "available sa mga regular service day/araw-araw ayon sa kasalukuyang barangay practice",
    clarification:
      "This schedule does not guarantee availability on a specific date or during an unannounced closure.",
    clarificationFilipino:
      "Hindi nito ginagarantiya ang availability sa isang partikular na petsa o kapag may hindi pa naipapaalam na closure.",
    patterns: [
      /\b(?:general consultation|general check[- ]?up|regular consultation|konsultasyon|magpa-?check[- ]?up)\b/i,
    ],
  },
  {
    id: "pregnancy_services",
    service: "Pregnancy-related services",
    serviceFilipino: "Pregnancy-related/Buntis services",
    schedule: "scheduled on Tuesdays",
    scheduleFilipino: "naka-schedule tuwing Martes",
    patterns: [
      /\b(?:pregnancy(?:-related)? services?|buntis services?|serbisyo (?:para )?sa (?:mga )?buntis|prenatal services?)\b/i,
    ],
  },
  {
    id: "maternal_care",
    service: "Maternal Care",
    serviceFilipino: "Maternal Care",
    schedule: "scheduled on the first Tuesday of every month",
    scheduleFilipino: "naka-schedule tuwing unang Martes ng buwan",
    patterns: [/\b(?:maternal care|pangangalaga sa ina)\b/i],
  },
  {
    id: "immunization",
    service: "Immunization",
    serviceFilipino: "Immunization",
    schedule: "scheduled on the first Wednesday of every month",
    scheduleFilipino: "naka-schedule tuwing unang Miyerkules ng buwan",
    patterns: [/\b(?:immunization|vaccination|bakuna|pagbabakuna)\b/i],
  },
  {
    id: "family_planning",
    service: "Family Planning",
    serviceFilipino: "Family Planning",
    schedule: "scheduled on Thursdays",
    scheduleFilipino: "naka-schedule tuwing Huwebes",
    patterns: [/\b(?:family planning|pagpaplano ng pamilya)\b/i],
  },
  {
    id: "postpartum_care",
    service: "Postpartum Care",
    serviceFilipino: "Postpartum Care",
    schedule:
      "provided through a healthcare-personnel home visit after childbirth, subject to coordination with the health center",
    scheduleFilipino:
      "isinasagawa sa pamamagitan ng home visit ng healthcare personnel pagkatapos manganak, ayon sa pakikipag-coordinate sa health center",
    patterns: [
      /\b(?:postpartum(?: care| services?)?|post-partum(?: care| services?)?|after childbirth|after giving birth|pagkatapos manganak|pagkatapos ng panganganak)\b/i,
    ],
  },
]);

const ALL_ROLES: readonly KnowledgeRole[] = [
  "admin",
  "barangay_health_worker",
  "nurse",
  "midwife",
  "resident",
];

const STAFF_ROLES: readonly KnowledgeRole[] = [
  "admin",
  "barangay_health_worker",
  "nurse",
  "midwife",
];

/**
 * Verified product behavior only. This catalog deliberately contains no
 * resident, appointment, clinical, staff-contact, or other private records.
 * Operational facts that can change are retrieved through approved RPCs.
 */
export const SYSTEM_KNOWLEDGE_ENTRIES: readonly SystemKnowledgeEntry[] = [
  {
    id: "system-overview",
    topic: "general_system",
    title: "What ALAGA-SYS is",
    aliases: [
      "what is alaga sys",
      "what does alaga sys do",
      "para saan ang alaga sys",
      "ano ang alaga sys",
      "ano ginagawa ng system",
      "system overview",
    ],
    keywords: ["alaga", "sys", "system", "sistema", "purpose", "overview"],
    facts: {
      english:
        "ALAGA-SYS is Barangay Bagongpook's role-based healthcare information system. It supports authorized registry, appointment, health-record, announcement, inquiry, notification, printable-output, and aggregate-reporting workflows. What a person can view or do is controlled by the signed-in role and the trusted server and database rules.",
      filipino:
        "Ang ALAGA-SYS ay role-based healthcare information system ng Barangay Bagongpook. Sinusuportahan nito ang awtorisadong registry, appointment, health record, announcement, inquiry, notification, printable output, at aggregate-reporting workflows. Ang maaaring makita o gawin ng user ay nakabatay sa signed-in role at sa trusted server at database rules.",
    },
  },
  {
    id: "role-responsibilities",
    topic: "general_system",
    title: "Roles and responsibilities",
    aliases: [
      "supported roles",
      "user roles",
      "role responsibilities",
      "ano trabaho ng bhw",
      "ano makikita ng nurse",
      "what does the nurse do",
      "what can a resident do",
      "administrator role",
      "midwife role",
    ],
    keywords: [
      "role",
      "roles",
      "admin",
      "administrator",
      "bhw",
      "nurse",
      "midwife",
      "resident",
      "trabaho",
      "tungkulin",
    ],
    facts: {
      english:
        "Administrator handles trusted account administration and authorized operations. BHW handles permitted registry, appointment-review, queue, inquiry, announcement, and aggregate-report workflows. Nurses and Midwives use their assigned appointment and authorized clinical-documentation workflows. Residents use their own appointment, notification, announcement, FAQ, health-center, and inquiry workflows.",
      filipino:
        "Ang Administrator ang namamahala sa trusted accounts at awtorisadong operations. Ang BHW ang humahawak sa pinahihintulutang registry, appointment review, queue, inquiry, announcement, at aggregate reports. Ginagamit ng Nurse at Midwife ang assigned appointments at awtorisadong clinical-documentation workflows. Ginagamit naman ng Resident ang sariling appointments, notifications, announcements, FAQ, health-center information, at inquiries.",
    },
  },
  {
    id: "resident-registration",
    topic: "registration",
    title: "Resident registration workflow",
    aliases: [
      "how to register",
      "resident registration",
      "create resident account",
      "paano mag register",
      "pano gumawa ng resident account",
      "email confirmation",
      "admin approval registration",
    ],
    keywords: [
      "register",
      "registration",
      "signup",
      "account",
      "email",
      "confirm",
      "approve",
      "resident",
    ],
    facts: {
      english:
        "A Resident creates a Resident account from the public registration page, confirms the email address, and waits for Administrator review. The Administrator verifies and links or creates the Resident record. The same Auth account becomes the active Resident account after approval. Public registration never offers a staff or Administrator role.",
      filipino:
        "Gumagawa ang Resident ng Resident account sa public registration page, kino-confirm ang email address, at naghihintay ng Administrator review. Vine-verify at sini-link o ginagawa ng Administrator ang Resident record. Ang parehong Auth account ang nagiging active Resident account pagkatapos ma-approve. Walang public registration para sa staff o Administrator role.",
    },
    access: {
      english:
        "Residents may submit registrations; only an active Administrator may review, approve, or link them.",
      filipino:
        "Maaaring magsumite ang Resident; active Administrator lamang ang maaaring mag-review, mag-approve, o mag-link nito.",
    },
  },
  {
    id: "appointment-request",
    topic: "appointment_workflow",
    title: "Appointment request workflow",
    aliases: [
      "how to request appointment",
      "how to book appointment",
      "paano mag appointment",
      "pano magpa appointment",
      "request appointment",
      "appointment request workflow",
    ],
    keywords: [
      "appointment",
      "request",
      "book",
      "schedule",
      "preferred",
      "review",
      "approved",
      "approval",
    ],
    facts: {
      english:
        "A Resident opens My Appointments, chooses Book Appointment, selects an AUTO_SLOT service, then chooses only a database-verified available date and time. The trusted booking workflow rechecks capacity, assigns eligible available staff, and creates the appointment as Confirmed without routine Administrator approval. Coordination-required services, including Postpartum Home Visit, direct the Resident to the health center instead of promising instant confirmation.",
      filipino:
        "Binubuksan ng Resident ang My Appointments, pinipili ang Book Appointment, pumipili ng AUTO_SLOT service, at pumipili lamang sa database-verified na available date at time. Muling chine-check ng trusted booking workflow ang capacity, awtomatikong nag-a-assign ng eligible available staff, at gumagawa ng Confirmed appointment nang walang routine Administrator approval. Para sa coordination-required services gaya ng Postpartum Home Visit, idirerekta ang Resident sa health center sa halip na mangako ng instant confirmation.",
    },
    answerFacets: {
      how_to_request: {
        english:
          "Open My Appointments, choose Book Appointment, select a service, then choose one of the available dates and times shown by the system. Review and book; a valid AUTO_SLOT booking is confirmed automatically.",
        filipino:
          "Pumunta sa My Appointments, piliin ang Book Appointment, pumili ng service, at pumili sa available dates at times na ipinapakita ng system. I-review at i-book; awtomatikong Confirmed ang valid AUTO_SLOT booking.",
      },
      where_to_request: {
        english:
          "Go to the My Appointments page and choose Book Appointment to get started.",
        filipino:
          "Sa My Appointments page. Piliin ang Book Appointment para makapagsimula.",
      },
      approval_behavior: {
        english:
          "For an AUTO_SLOT service, yes: if the selected slot remains available and booking succeeds, the appointment is automatically Confirmed and does not need routine Admin approval. Coordination-required services are not instantly confirmed.",
        filipino:
          "Para sa AUTO_SLOT service, oo: kapag available pa ang slot at successful ang booking, awtomatikong Confirmed ang appointment at hindi na kailangan ng routine Admin approval. Hindi instant na kino-confirm ang coordination-required services.",
      },
      what_happens_next: {
        english:
          "The database revalidates the service schedule and capacity, selects eligible available staff, and creates a successful AUTO_SLOT booking as Confirmed. Staff handle exceptions, rescheduling, cancellation, walk-ins, and retained pending workflows.",
        filipino:
          "Muling vine-validate ng database ang service schedule at capacity, pumipili ng eligible available staff, at ginagawa agad na Confirmed ang successful AUTO_SLOT booking. Staff ang humahawak ng exceptions, rescheduling, cancellation, walk-ins, at retained pending workflows.",
      },
      staff_review: {
        english:
          "Routine valid AUTO_SLOT self-bookings need no Administrator or BHW review. Administrator and BHW retain exception management and may handle legacy or exceptional pending requests, rescheduling, cancellation, walk-ins, and staff-assisted appointments.",
        filipino:
          "Hindi na kailangan ng Administrator o BHW review ang routine valid AUTO_SLOT self-booking. Nananatili sa Administrator at BHW ang exception management at paghawak ng legacy o exceptional pending requests, rescheduling, cancellation, walk-ins, at staff-assisted appointments.",
      },
      general_workflow: {
        english:
          "A Resident opens My Appointments, chooses Book Appointment, selects an AUTO_SLOT service, and chooses a system-available date and time. The trusted database rechecks the slot, assigns eligible available staff, and confirms the appointment automatically. Coordination-required services are arranged with the health center instead.",
        filipino:
          "Binubuksan ng Resident ang My Appointments, pinipili ang Book Appointment, pumipili ng AUTO_SLOT service, at pumipili ng system-available date at time. Muling chine-check ng trusted database ang slot, awtomatikong nag-a-assign ng eligible available staff, at kino-confirm ang appointment. Sa health center inaayos ang coordination-required services.",
      },
    },
    access: {
      english:
        "Residents book only for their own linked record and cannot choose staff or status. Administrator and BHW manage exceptions and operations; Nurse and Midwife use only their authorized assigned workflow.",
      filipino:
        "Para lamang sa sariling linked record makakapag-book ang Resident at hindi siya makakapili ng staff o status. Administrator at BHW ang namamahala ng exceptions at operations; awtorisadong assigned workflow lamang ang ginagamit ng Nurse at Midwife.",
    },
    actionId: "open_appointments",
    actionRoles: ALL_ROLES,
  },
  {
    id: "appointment-lifecycle",
    topic: "appointment_workflow",
    title: "Appointment lifecycle and status meaning",
    aliases: [
      "appointment lifecycle",
      "appointment statuses",
      "what does pending mean",
      "ano ibig sabihin ng pending",
      "confirmed checked in completed",
      "status ng appointment",
    ],
    keywords: [
      "pending",
      "confirmed",
      "checked",
      "completed",
      "cancelled",
      "status",
      "lifecycle",
    ],
    facts: {
      english:
        "The standard AUTO_SLOT Resident flow starts at Confirmed after database validation and automatic staff assignment, then proceeds to Checked in and Completed. Pending remains for historical or exceptional workflows. Cancelled and No-show are terminal outcomes. An internal In consultation state may appear when clinical work is documented, but no manual Start action is required.",
      filipino:
        "Ang standard AUTO_SLOT Resident flow ay nagsisimula sa Confirmed pagkatapos ng database validation at automatic staff assignment, saka Checked in at Completed. Nananatili ang Pending para sa historical o exceptional workflows. Terminal outcomes ang Cancelled at No-show. Maaaring lumitaw ang internal na In consultation kapag may clinical documentation, pero walang kailangang manual Start action.",
    },
    answerFacets: {
      status_meaning: {
        english:
          "A successful standard Resident AUTO_SLOT booking is immediately Confirmed. Pending identifies a historical or exceptional request awaiting staff handling. Checked in records arrival, Completed means the workflow is finished, and Cancelled and No-show are terminal outcomes.",
        filipino:
          "Agad na Confirmed ang successful standard Resident AUTO_SLOT booking. Ang Pending ay historical o exceptional request na hinihintay ang staff handling. Ang Checked in ay tala ng pagdating, ang Completed ay tapos na ang workflow, at terminal outcomes ang Cancelled at No-show.",
      },
    },
    actionId: "open_appointments",
    actionRoles: ALL_ROLES,
  },
  {
    id: "appointment-change",
    topic: "appointment_workflow",
    title: "Rescheduling and cancellation",
    aliases: [
      "how to cancel appointment",
      "how to reschedule appointment",
      "paano mag cancel",
      "paano mag reschedule",
      "change appointment schedule",
      "same appointment number",
    ],
    keywords: [
      "appointment",
      "cancel",
      "reschedule",
      "change",
      "schedule",
      "reason",
    ],
    facts: {
      english:
        "An authorized cancellation follows the existing role, ownership, status, and version rules; its narrative reason is optional, while request rejection still requires justification. Rescheduling updates the same appointment row and APT number. The original Resident preferred schedule remains historical request information while the current operational schedule is authoritative.",
      filipino:
        "Ang awtorisadong cancellation ay sumusunod pa rin sa role, ownership, status, at version rules; optional ang cancellation narrative, pero required pa rin ang justification sa request rejection. Ina-update ng reschedule ang parehong appointment row at APT number. Nananatiling historical request information ang original preferred schedule ng Resident, habang authoritative ang current operational schedule.",
    },
    answerFacets: {
      reschedule: {
        english:
          "Rescheduling updates the same appointment row and APT number. The original preferred schedule remains historical request information, while the current operational schedule is authoritative.",
        filipino:
          "Ina-update ng reschedule ang parehong appointment row at APT number. Nananatiling historical request information ang original preferred schedule, habang authoritative ang current operational schedule.",
      },
      cancel: {
        english:
          "An authorized cancellation follows the existing role, ownership, status, and version rules. Its cancellation narrative is optional, while request rejection still requires justification.",
        filipino:
          "Ang awtorisadong cancellation ay sumusunod sa existing role, ownership, status, at version rules. Optional ang cancellation narrative, pero required pa rin ang justification sa request rejection.",
      },
    },
    actionId: "open_appointments",
    actionRoles: ALL_ROLES,
  },
  {
    id: "staff-assisted-appointment",
    topic: "appointment_workflow",
    title: "Staff-assisted and walk-in appointment workflow",
    aliases: [
      "staff appointment workflow",
      "staff assisted appointment",
      "walk in workflow",
      "walkin appointment",
      "create appointment for resident",
    ],
    keywords: ["staff", "walk", "appointment", "create", "resident", "queue"],
    facts: {
      english:
        "Authorized Administrator or BHW staff may create or schedule an appointment for a Resident under the trusted appointment workflow. Walk-in operations still use the Resident, service, current schedule, assignment, status, and queue rules; they do not bypass authorization or create public staff access.",
      filipino:
        "Maaaring gumawa o mag-schedule ang awtorisadong Administrator o BHW ng appointment para sa Resident gamit ang trusted appointment workflow. Sinusunod pa rin ng walk-in operations ang Resident, service, current schedule, assignment, status, at queue rules; hindi nito nilalampasan ang authorization o nagbibigay ng public staff access.",
    },
    access: {
      english:
        "Staff-assisted creation is limited to roles already authorized by the appointment workflow.",
      filipino:
        "Ang staff-assisted creation ay para lamang sa mga role na awtorisado na ng appointment workflow.",
    },
    actionId: "open_appointments",
    actionRoles: ["admin", "barangay_health_worker"],
  },
  {
    id: "resident-registry",
    topic: "resident_registry",
    title: "Resident Registry",
    aliases: [
      "what is resident registry",
      "para saan residents",
      "resident records module",
      "ano ginagawa ng residents",
    ],
    keywords: ["resident", "residents", "registry", "profile", "demographic"],
    facts: {
      english:
        "The Resident Registry maintains authorized demographic and locality records used by health-center workflows. It is not a public directory and does not make private Resident records available to ALAGA AI.",
      filipino:
        "Ang Resident Registry ang nagpapanatili ng awtorisadong demographic at locality records na ginagamit sa health-center workflows. Hindi ito public directory at hindi nito ibinibigay sa ALAGA AI ang private Resident records.",
    },
    access: {
      english:
        "Administrator and BHW use the Registry management pages. Other roles do not receive Registry management access through the assistant.",
      filipino:
        "Administrator at BHW ang gumagamit ng Registry management pages. Hindi binibigyan ng assistant ang ibang role ng Registry management access.",
    },
    actionId: "open_residents",
    actionRoles: ["admin", "barangay_health_worker"],
  },
  {
    id: "health-records",
    topic: "health_records",
    title: "Health Records and encounters",
    aliases: [
      "what are health records",
      "para saan health records",
      "health encounter purpose",
      "clinical encounter",
      "appointment versus health record",
      "pagkakaiba appointment health record",
    ],
    keywords: [
      "health",
      "record",
      "records",
      "encounter",
      "clinical",
      "consultation",
      "appointment",
    ],
    facts: {
      english:
        "An appointment coordinates an operational visit; a Health Record documents authorized clinical information when documentation is actually needed. A health encounter is the structured consultation record and may be linked to an appointment, but an appointment can be completed without forcing an encounter. ALAGA AI never reads clinical narratives.",
      filipino:
        "Ang appointment ang nag-aayos ng operational visit; ang Health Record ang nagdo-document ng awtorisadong clinical information kapag kailangan talaga. Ang health encounter ay structured consultation record at maaaring i-link sa appointment, pero maaaring matapos ang appointment nang hindi pinipilit ang encounter. Hindi binabasa ng ALAGA AI ang clinical narratives.",
    },
    access: {
      english:
        "Nurse and Midwife retain authorized clinical-documentation access. BHW sees only the approved minimized metadata. Resident access is limited to the Resident-safe signed-record/document workflow. Administrator masking rules remain authoritative.",
      filipino:
        "Nananatili sa Nurse at Midwife ang awtorisadong clinical-documentation access. Approved minimized metadata lamang ang nakikita ng BHW. Resident-safe signed-record/document workflow lamang ang para sa Resident. Authoritative pa rin ang Administrator masking rules.",
    },
    actionId: "open_health_records",
    actionRoles: ALL_ROLES,
  },
  {
    id: "vital-signs",
    topic: "health_records",
    title: "Vital signs",
    aliases: [
      "what are vital signs",
      "para saan vital signs",
      "vitals purpose",
      "vital signs workflow",
    ],
    keywords: ["vital", "vitals", "signs", "measurement", "clinical"],
    facts: {
      english:
        "Vital Signs stores authorized measurements associated with clinical care. Recording and interpretation remain clinical responsibilities; ALAGA AI can explain the workflow but cannot inspect, interpret, diagnose from, or disclose a person's measurements.",
      filipino:
        "Ang Vital Signs ay nagtatala ng awtorisadong measurements na kaugnay ng clinical care. Clinical responsibility ang pag-record at interpretation; maipapaliwanag ng ALAGA AI ang workflow pero hindi nito maaaring tingnan, i-interpret, gamitin sa diagnosis, o ilantad ang measurements ng isang tao.",
    },
    actionId: "open_health_record_vital_signs",
    actionRoles: ALL_ROLES,
  },
  {
    id: "announcement-semantics",
    topic: "announcement",
    title: "Announcement publication and event dates",
    aliases: [
      "announcement versus notification",
      "publication versus event",
      "publish date event date expiration",
      "what is event end",
      "ano yung event end",
      "event end versus expiration",
      "pagkakaiba event end expiration",
    ],
    keywords: [
      "announcement",
      "notification",
      "publish",
      "publication",
      "event",
      "end",
      "expiration",
      "expiry",
    ],
    facts: {
      english:
        "Publish at controls when an announcement becomes visible and when its announcement notifications become available. Event start and Event end describe the activity schedule. Expiration controls when the announcement stops being current. These dates are not interchangeable, and a scheduled future announcement is not published early.",
      filipino:
        "Ang Publish at ang nagtatakda kung kailan magiging visible ang announcement at available ang announcement notifications. Ang Event start at Event end ang schedule ng activity. Ang Expiration ang nagtatakda kung kailan hindi na current ang announcement. Hindi mapagpapalit ang mga petsang ito, at hindi napa-publish nang maaga ang future scheduled announcement.",
    },
    access: {
      english:
        "All roles may read current announcements. Administrator and BHW may manage announcements; other roles remain read-only.",
      filipino:
        "Maaaring magbasa ng current announcements ang lahat ng role. Administrator at BHW lamang ang maaaring mag-manage; read-only ang ibang role.",
    },
    actionId: "open_announcements",
    actionRoles: ALL_ROLES,
  },
  {
    id: "notifications",
    topic: "notifications",
    title: "Notifications",
    aliases: [
      "what are notifications",
      "ano ginagawa ng notifications",
      "notification preferences",
      "announcement versus notification",
      "unread notifications",
    ],
    keywords: [
      "notification",
      "notifications",
      "unread",
      "preference",
      "alert",
    ],
    facts: {
      english:
        "Notifications are account-specific updates generated by trusted workflows, such as appointment changes, reminders, announcements, inquiry updates, and signed-document availability where applicable. An announcement is shared published content; a notification is a recipient-specific alert about an event or update. Read state belongs only to the signed-in recipient.",
      filipino:
        "Ang Notifications ay account-specific updates mula sa trusted workflows, gaya ng appointment changes, reminders, announcements, inquiry updates, at signed-document availability kung applicable. Ang announcement ay shared published content; ang notification ay recipient-specific alert tungkol sa event o update. Sa signed-in recipient lamang ang read state.",
    },
    access: {
      english:
        "Each user may access only their own notifications. The assistant does not provide cross-user read receipts.",
      filipino:
        "Sariling notifications lamang ang maaaring makita ng bawat user. Hindi nagbibigay ang assistant ng cross-user read receipts.",
    },
    actionId: "open_notifications",
    actionRoles: ["resident"],
  },
  {
    id: "inquiries",
    topic: "inquiries",
    title: "Inquiries",
    aliases: [
      "what are inquiries",
      "send inquiry",
      "paano mag inquiry",
      "contact health center in system",
      "ask barangay health center",
    ],
    keywords: [
      "inquiry",
      "inquiries",
      "question",
      "contact",
      "message",
      "tanong",
    ],
    facts: {
      english:
        "Inquiries provide a trusted in-system path for a Resident to ask the Barangay Health Center a non-emergency operational question and for authorized Administrator or BHW staff to respond. It is not an emergency or clinical-diagnosis channel.",
      filipino:
        "Ang Inquiries ay trusted in-system path para makapagtanong ang Resident sa Barangay Health Center tungkol sa non-emergency operational concern at para makasagot ang awtorisadong Administrator o BHW. Hindi ito emergency o clinical-diagnosis channel.",
    },
    access: {
      english:
        "Resident, Administrator, and BHW use the authorized inquiry workflow.",
      filipino:
        "Resident, Administrator, at BHW ang gumagamit ng awtorisadong inquiry workflow.",
    },
    actionId: "open_inquiries",
    actionRoles: ["admin", "barangay_health_worker", "resident"],
  },
  {
    id: "health-center-information",
    topic: "health_center",
    title: "Health Center Information",
    aliases: [
      "health center information",
      "clinic information",
      "barangay health center",
      "contact health center",
    ],
    keywords: ["health", "center", "clinic", "contact", "address", "hours"],
    facts: {
      english:
        "Health Center Information contains approved public details such as the configured center name, address, public contact, operating hours, and offered services. Current values are retrieved from the approved public-information source; staff personal contact details are not exposed.",
      filipino:
        "Ang Health Center Information ay may approved public details gaya ng configured center name, address, public contact, operating hours, at offered services. Kinukuha ang current values sa approved public-information source; hindi inilalantad ang personal contact details ng staff.",
    },
    actionId: "open_health_center",
    actionRoles: ALL_ROLES,
  },
  {
    id: "faq",
    topic: "faq",
    title: "Frequently Asked Questions",
    aliases: [
      "what is faq",
      "frequently asked questions",
      "para saan faq",
      "madalas itanong",
    ],
    keywords: ["faq", "faqs", "question", "questions", "help", "tanong"],
    facts: {
      english:
        "FAQ provides maintained public answers to common Barangay Health Center and ALAGA-SYS questions. Active FAQ answers are retrieved through the approved public grounding source; unsupported facts are not inferred.",
      filipino:
        "Ang FAQ ay maintained public answers sa karaniwang tanong tungkol sa Barangay Health Center at ALAGA-SYS. Kinukuha ang active FAQ answers sa approved public grounding source; hindi ini-infer ang unsupported facts.",
    },
    actionId: "open_faq",
    actionRoles: ALL_ROLES,
  },
  {
    id: "reports",
    topic: "reports",
    title: "Reports and analytics",
    aliases: [
      "what are reports",
      "para saan reports",
      "appointment reports",
      "resident summary",
      "report exports",
    ],
    keywords: [
      "report",
      "reports",
      "analytics",
      "summary",
      "aggregate",
      "excel",
      "pdf",
      "print",
    ],
    facts: {
      english:
        "Reports provides authorized aggregate views for Overview, Resident Summary, and Appointment Reports with date filters and PDF and Print outputs. It does not give ALAGA AI access to report rows or private records.",
      filipino:
        "Ang Reports ay nagbibigay ng awtorisadong aggregate views para sa Overview, Resident Summary, at Appointment Reports, kasama ang date filters at PDF at Print outputs. Hindi nito binibigyan ang ALAGA AI ng access sa report rows o private records.",
    },
    access: {
      english:
        "Reports is available to Administrator and BHW under existing route and database authorization. It is not opened for Resident, Nurse, or Midwife by the assistant.",
      filipino:
        "Available ang Reports sa Administrator at BHW ayon sa existing route at database authorization. Hindi ito binubuksan ng assistant para sa Resident, Nurse, o Midwife.",
    },
    actionId: "open_reports",
    actionRoles: ["admin", "barangay_health_worker"],
  },
  {
    id: "user-management",
    topic: "user_management",
    title: "User Management",
    aliases: [
      "what is user management",
      "why user management",
      "bakit may user management",
      "manage user accounts",
      "approve resident registration",
    ],
    keywords: ["user", "management", "account", "approve", "role", "status"],
    facts: {
      english:
        "User Management is the Administrator's trusted interface for reviewing Resident registrations and managing approved accounts, roles, and statuses. Permanent deletion or retirement is handled only through guarded server workflows; protected history is never broadly cascade-deleted.",
      filipino:
        "Ang User Management ay trusted interface ng Administrator para mag-review ng Resident registrations at pamahalaan ang approved accounts, roles, at statuses. Guarded server workflows lamang ang permanent deletion o retirement; hindi broadly cascade-deleted ang protected history.",
    },
    access: {
      english:
        "Only an active Administrator may use User Management. The assistant cannot grant this permission or perform account mutations.",
      filipino:
        "Active Administrator lamang ang maaaring gumamit ng User Management. Hindi kayang magbigay ng permission o gumawa ng account mutation ang assistant.",
    },
    actionId: "open_user_management",
    actionRoles: ["admin"],
  },
  {
    id: "account-lifecycle",
    topic: "account_management",
    title: "Account lifecycle and recovery",
    aliases: [
      "account lifecycle",
      "change password",
      "forgot password",
      "reset password",
      "deactivate suspend retire delete account",
      "account status",
    ],
    keywords: [
      "account",
      "password",
      "recovery",
      "deactivate",
      "suspend",
      "retire",
      "delete",
      "status",
    ],
    facts: {
      english:
        "Password recovery uses Supabase Auth email recovery and a valid recovery session. Account status changes remain trusted administrative actions. Dependency-free eligible non-Administrator accounts may use the guarded permanent-delete workflow; accounts with protected history use deactivation or retirement so required records remain intact. Administrator accounts cannot be permanently deleted or retired.",
      filipino:
        "Gumagamit ang password recovery ng Supabase Auth email recovery at valid recovery session. Trusted administrative actions pa rin ang account status changes. Maaaring dumaan sa guarded permanent-delete workflow ang eligible dependency-free non-Administrator account; deactivation o retirement ang ginagamit kapag may protected history para manatiling intact ang required records. Hindi maaaring permanently delete o retire ang Administrator accounts.",
    },
  },
  {
    id: "printable-outputs",
    topic: "general_system",
    title: "Printable outputs",
    aliases: [
      "printable outputs",
      "what can i print",
      "print appointment slip",
      "pdf documents",
      "print reports",
    ],
    keywords: ["print", "printable", "pdf", "slip", "document", "export"],
    facts: {
      english:
        "ALAGA-SYS provides role-authorized printable outputs where implemented, including appointment slips, approved clinical documents, and report PDF/Print outputs. Print actions use the same authorization and masking rules as the source screen and do not expand data access.",
      filipino:
        "May role-authorized printable outputs ang ALAGA-SYS kung saan implemented, kasama ang appointment slips, approved clinical documents, at report PDF/Print outputs. Pareho ang authorization at masking rules ng print action at source screen; hindi nito pinalalawak ang data access.",
    },
  },
  {
    id: "navigation-help",
    topic: "navigation",
    title: "Navigation help",
    aliases: [
      "where can i find that",
      "where is that",
      "saan ko makikita",
      "how do i open it",
      "navigation help",
      "safe navigation",
    ],
    keywords: [
      "open",
      "where",
      "saan",
      "find",
      "navigate",
      "navigation",
      "page",
      "module",
    ],
    facts: {
      english:
        "ALAGA AI may offer only pre-approved symbolic navigation actions for pages available to the signed-in role. The server and frontend both allowlist the action; the model never creates a raw URL or bypasses a route guard.",
      filipino:
        "Pre-approved symbolic navigation actions lamang para sa pages na available sa signed-in role ang maaaring ialok ng ALAGA AI. Parehong may allowlist ang server at frontend; hindi gumagawa ang model ng raw URL o lumalampas sa route guard.",
    },
  },
  {
    id: "alaga-ai",
    topic: "alaga_ai",
    title: "ALAGA AI purpose and limits",
    aliases: [
      "what is alaga ai",
      "what can alaga ai do",
      "ano ginagawa ng alaga ai",
      "alaga ai limitations",
      "is alaga ai a doctor",
    ],
    keywords: ["alaga", "ai", "assistant", "limitations", "help", "doctor"],
    facts: {
      english:
        "ALAGA AI is a grounded, read-only conversational assistant for verified ALAGA-SYS workflows, approved public information, safe navigation, and a Resident's narrowly scoped own-appointment summary. It has no permanent chat memory, cannot mutate records, cannot retrieve arbitrary private data, and cannot diagnose, prescribe, or replace professional healthcare judgment.",
      filipino:
        "Ang ALAGA AI ay grounded at read-only conversational assistant para sa verified ALAGA-SYS workflows, approved public information, safe navigation, at narrowly scoped sariling appointment summary ng Resident. Wala itong permanent chat memory, hindi ito nagmu-mutate ng records, hindi ito kumukuha ng arbitrary private data, at hindi ito maaaring mag-diagnose, magreseta, o pumalit sa professional healthcare judgment.",
    },
  },
  {
    id: "service-schedule-authority",
    topic: "service_schedule",
    title: "Barangay Bagongpook service schedule",
    aliases: [
      "service schedule",
      "barangay health service schedule",
      "kailan ang services",
      "schedule ng serbisyo",
    ],
    keywords: [
      "service",
      "schedule",
      "consultation",
      "prenatal",
      "immunization",
      "family",
      "postpartum",
    ],
    facts: {
      english:
        "Barangay Bagongpook service schedules are canonical operational information. Exact service days are formatted by the deterministic schedule handler. A service schedule does not guarantee real-time staff availability, a specific appointment, or unannounced closure information.",
      filipino:
        "Canonical operational information ang Barangay Bagongpook service schedules. Ang exact service days ay fino-format ng deterministic schedule handler. Hindi garantiya ng service schedule ang real-time staff availability, specific appointment, o unannounced closure information.",
    },
    actionId: "open_health_center",
    actionRoles: ALL_ROLES,
  },
] as const;

export const SYSTEM_KNOWLEDGE_TOPICS = Object.freeze<SystemKnowledgeTopic[]>([
  "appointment_workflow",
  "own_appointment_status",
  "announcement",
  "health_center",
  "faq",
  "service_schedule",
  "registration",
  "notifications",
  "inquiries",
  "reports",
  "resident_registry",
  "health_records",
  "user_management",
  "account_management",
  "navigation",
  "alaga_ai",
  "general_system",
]);

export const SYSTEM_KNOWLEDGE_STAFF_ROLES = STAFF_ROLES;
