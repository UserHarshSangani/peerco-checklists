// Every UI string (buttons, messages, labels, errors) lives here as one row
// per key, English/Hindi/Marathi side by side, so a native speaker can
// review or edit a language without hunting across files. Checklist and
// template names are user-entered content and are never translated — they
// don't belong in this file.
//
// `satisfies` below makes TypeScript fail the build if any row is missing a
// language or has a typo'd locale key.

export type Locale = "en" | "hi" | "mr";

export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  hi: "हिन्दी",
  mr: "मराठी",
};

type Entry = Record<Locale, string>;

const dictionary = {
  // Shared
  "common.logOut": { en: "Log out", hi: "लॉग आउट करें", mr: "लॉग आउट करा" },
  "common.loggingOut": {
    en: "Logging out…",
    hi: "लॉग आउट हो रहे हैं…",
    mr: "लॉग आउट होत आहे…",
  },
  "common.cancel": { en: "Cancel", hi: "रद्द करें", mr: "रद्द करा" },
  "common.save": { en: "Save", hi: "सेव करें", mr: "सेव्ह करा" },
  "common.close": { en: "Close", hi: "बंद करें", mr: "बंद करा" },
  "common.back": { en: "Back", hi: "वापस", mr: "मागे" },
  "common.done": { en: "Done", hi: "हो गया", mr: "झाले" },
  "common.loading": { en: "Loading…", hi: "लोड हो रहा है…", mr: "लोड होत आहे…" },
  "common.retry": { en: "Retry", hi: "फिर कोशिश करें", mr: "पुन्हा प्रयत्न करा" },
  "common.theme": { en: "Theme", hi: "थीम", mr: "थीम" },
  "common.themeLight": { en: "Light", hi: "हल्का", mr: "फिकट" },
  "common.themeDark": { en: "Dark", hi: "गहरा", mr: "गडद" },
  "common.themeSystem": { en: "System", hi: "सिस्टम", mr: "सिस्टम" },
  "common.language": { en: "Language", hi: "भाषा", mr: "भाषा" },
  "common.backToChecklists": {
    en: "Back to checklists",
    hi: "चेकलिस्ट पर वापस जाएं",
    mr: "चेकलिस्टवर परत जा",
  },
  "common.noOutlets": {
    en: "No outlets are assigned to your account yet.",
    hi: "अभी आपके खाते में कोई आउटलेट नहीं जोड़ा गया है।",
    mr: "अजून तुमच्या खात्याला कोणतेही आउटलेट नियुक्त केलेले नाही.",
  },
  "common.checklistsHeading": {
    en: "Checklists",
    hi: "चेकलिस्ट",
    mr: "चेकलिस्ट",
  },
  "common.loadChecklistsError": {
    en: "Couldn't load checklists: {error}",
    hi: "चेकलिस्ट लोड नहीं हो सकीं: {error}",
    mr: "चेकलिस्ट लोड करता आल्या नाहीत: {error}",
  },
  "common.noActiveChecklists": {
    en: "No active checklists for this outlet.",
    hi: "इस आउटलेट के लिए कोई सक्रिय चेकलिस्ट नहीं है।",
    mr: "या आउटलेटसाठी कोणतीही सक्रिय चेकलिस्ट नाही.",
  },
  "common.loadStaffError": {
    en: "Couldn't load staff: {error}",
    hi: "स्टाफ लोड नहीं हो सका: {error}",
    mr: "स्टाफ लोड करता आला नाही: {error}",
  },
  "common.nameLabel": { en: "Name", hi: "नाम", mr: "नाव" },
  "common.nameEmpty": {
    en: "Name can't be empty.",
    hi: "नाम खाली नहीं हो सकता।",
    mr: "नाव रिकामे असू शकत नाही.",
  },
  "common.enterName": {
    en: "Enter a name.",
    hi: "एक नाम डालें।",
    mr: "एक नाव टाका.",
  },
  "common.saving": { en: "Saving…", hi: "सेव हो रहा है…", mr: "सेव्ह होत आहे…" },

  // Install-this-app hint (/tablet)
  "install.prompt": {
    en: "Install this app for quick access from your home screen.",
    hi: "होम स्क्रीन से जल्दी खोलने के लिए यह ऐप इंस्टॉल करें।",
    mr: "होम स्क्रीनवरून पटकन उघडण्यासाठी हे अ‍ॅप इन्स्टॉल करा.",
  },
  "install.installAction": {
    en: "Install",
    hi: "इंस्टॉल करें",
    mr: "इन्स्टॉल करा",
  },
  "install.iosHint": {
    en: 'Tap Share, then "Add to Home Screen" to install this app.',
    hi: 'यह ऐप इंस्टॉल करने के लिए शेयर बटन दबाएं, फिर "होम स्क्रीन पर जोड़ें" चुनें।',
    mr: 'हे अ‍ॅप इन्स्टॉल करण्यासाठी शेअर बटण दाबा, नंतर "होम स्क्रीनवर जोडा" निवडा.',
  },

  // /login
  "auth.email": { en: "Email", hi: "ईमेल", mr: "ईमेल" },
  "auth.password": { en: "Password", hi: "पासवर्ड", mr: "पासवर्ड" },
  "auth.signIn": { en: "Sign in", hi: "साइन इन करें", mr: "साइन इन करा" },
  "auth.signingIn": {
    en: "Signing in…",
    hi: "साइन इन हो रहा है…",
    mr: "साइन इन होत आहे…",
  },
  "auth.enterCredentials": {
    en: "Enter your email and password.",
    hi: "अपना ईमेल और पासवर्ड डालें।",
    mr: "तुमचा ईमेल आणि पासवर्ड टाका.",
  },
  "auth.incorrectCredentials": {
    en: "Incorrect email or password.",
    hi: "गलत ईमेल या पासवर्ड।",
    mr: "चुकीचा ईमेल किंवा पासवर्ड.",
  },
  "auth.noProfile": {
    en: "No profile is set up for this account.",
    hi: "इस खाते के लिए कोई प्रोफ़ाइल सेट नहीं है।",
    mr: "या खात्यासाठी कोणतीही प्रोफाइल सेट केलेली नाही.",
  },

  // Nav bar (manager roles)
  "nav.dashboard": { en: "Dashboard", hi: "डैशबोर्ड", mr: "डॅशबोर्ड" },
  "nav.history": { en: "History", hi: "इतिहास", mr: "इतिहास" },
  "nav.staff": { en: "Staff", hi: "स्टाफ", mr: "स्टाफ" },
  "nav.checklists": { en: "Checklists", hi: "चेकलिस्ट", mr: "चेकलिस्ट" },
  "nav.tablet": { en: "Tablet", hi: "टैबलेट", mr: "टॅबलेट" },

  // /tablet — outlet & checklist list
  "tablet.switchOutlet": {
    en: "Switch outlet",
    hi: "आउटलेट बदलें",
    mr: "आउटलेट बदला",
  },
  "tablet.chooseOutlet": {
    en: "Choose an outlet",
    hi: "एक आउटलेट चुनें",
    mr: "एक आउटलेट निवडा",
  },
  "tablet.loadingChecklists": {
    en: "Loading checklists…",
    hi: "चेकलिस्ट लोड हो रही हैं…",
    mr: "चेकलिस्ट लोड होत आहेत…",
  },

  // /tablet — checklist detail
  "tablet.loadingChecklist": {
    en: "Loading checklist…",
    hi: "चेकलिस्ट लोड हो रही है…",
    mr: "चेकलिस्ट लोड होत आहे…",
  },
  "tablet.loadChecklistError": {
    en: "Couldn't load checklist: {error}",
    hi: "चेकलिस्ट लोड नहीं हो सकी: {error}",
    mr: "चेकलिस्ट लोड करता आली नाही: {error}",
  },
  "tablet.required": { en: "Required", hi: "आवश्यक", mr: "आवश्यक" },
  "tablet.notDonePlaceholder": {
    en: "Why wasn't this done?",
    hi: "यह पूरा क्यों नहीं हुआ?",
    mr: "हे का झाले नाही?",
  },
  "tablet.noteValidation": {
    en: "Check it off or add a short note.",
    hi: "इसे चेक करें या एक छोटा नोट लिखें।",
    mr: "हे टिक करा किंवा छोटी नोंद लिहा.",
  },
  "tablet.notesLabel": {
    en: "Notes (optional)",
    hi: "नोट्स (वैकल्पिक)",
    mr: "नोंदी (ऐच्छिक)",
  },
  "tablet.notesPlaceholder": {
    en: "Anything else worth noting…",
    hi: "कुछ और बताना हो तो लिखें…",
    mr: "आणखी काही नोंदवायचे असल्यास लिहा…",
  },
  "tablet.progress": {
    en: "{done} of {total} done",
    hi: "{total} में से {done} पूरे",
    mr: "{total} पैकी {done} पूर्ण",
  },
  "tablet.missingItems": {
    en: "{count} item(s) need a note before you can submit",
    hi: "सबमिट करने से पहले {count} आइटम को नोट चाहिए",
    mr: "सबमिट करण्यापूर्वी {count} आयटमला नोंद हवी",
  },
  "tablet.submit": { en: "Submit", hi: "सबमिट करें", mr: "सबमिट करा" },

  // /tablet — submit flow (staff picker, PIN pad, success)
  "tablet.whosSubmitting": {
    en: "Who's submitting?",
    hi: "कौन सबमिट कर रहा है?",
    mr: "कोण सबमिट करत आहे?",
  },
  "tablet.loadingStaff": {
    en: "Loading staff…",
    hi: "स्टाफ लोड हो रहा है…",
    mr: "स्टाफ लोड होत आहे…",
  },
  "tablet.noActiveStaff": {
    en: "No active staff found for this outlet.",
    hi: "इस आउटलेट के लिए कोई सक्रिय स्टाफ नहीं मिला।",
    mr: "या आउटलेटसाठी कोणताही सक्रिय स्टाफ आढळला नाही.",
  },
  "tablet.enterPin": {
    en: "Enter your PIN",
    hi: "अपना पिन डालें",
    mr: "तुमचा पिन टाका",
  },
  "tablet.clear": { en: "Clear", hi: "साफ़ करें", mr: "साफ करा" },
  "tablet.backspace": { en: "Backspace", hi: "बैकस्पेस", mr: "बॅकस्पेस" },
  "tablet.submitting": {
    en: "Submitting…",
    hi: "सबमिट हो रहा है…",
    mr: "सबमिट होत आहे…",
  },
  "tablet.submittedBy": {
    en: "Submitted by {name}",
    hi: "{name} द्वारा सबमिट किया गया",
    mr: "{name} यांनी सबमिट केले",
  },
  "tablet.reason.invalid_pin": {
    en: "Wrong PIN, try again.",
    hi: "गलत पिन, फिर कोशिश करें।",
    mr: "चुकीचा पिन, पुन्हा प्रयत्न करा.",
  },
  "tablet.reason.missing_required": {
    en: "Some required items are unchecked without a note.",
    hi: "कुछ ज़रूरी आइटम बिना नोट के अधूरे हैं।",
    mr: "काही आवश्यक आयटम नोंदीशिवाय अपूर्ण आहेत.",
  },
  "tablet.reason.bad_date": {
    en: "Something went wrong with today's date. Please try again.",
    hi: "आज की तारीख में कुछ गड़बड़ी हुई है। कृपया फिर कोशिश करें।",
    mr: "आजच्या तारखेत काहीतरी चूक झाली. कृपया पुन्हा प्रयत्न करा.",
  },
  "tablet.reason.invalid_staff": {
    en: "This staff member can't submit for this outlet.",
    hi: "यह स्टाफ सदस्य इस आउटलेट के लिए सबमिट नहीं कर सकता।",
    mr: "हा स्टाफ सदस्य या आउटलेटसाठी सबमिट करू शकत नाही.",
  },
  "tablet.reason.not_allowed": {
    en: "This checklist isn't available right now.",
    hi: "यह चेकलिस्ट अभी उपलब्ध नहीं है।",
    mr: "ही चेकलिस्ट सध्या उपलब्ध नाही.",
  },
  "tablet.reason.bad_request": {
    en: "Something went wrong. Please try again.",
    hi: "कुछ गड़बड़ हुई। कृपया फिर कोशिश करें।",
    mr: "काहीतरी चूक झाली. कृपया पुन्हा प्रयत्न करा.",
  },
  "tablet.reason.locked": {
    en: "{name} is locked for a few minutes. Try again after {time}.",
    hi: "{name} कुछ मिनटों के लिए लॉक है। {time} के बाद फिर कोशिश करें।",
    mr: "{name} काही मिनिटांसाठी लॉक आहे. {time} नंतर पुन्हा प्रयत्न करा.",
  },
  "tablet.reason.lockedNoTime": {
    en: "{name} is locked for a few minutes. Try again shortly.",
    hi: "{name} कुछ मिनटों के लिए लॉक है। थोड़ी देर बाद फिर कोशिश करें।",
    mr: "{name} काही मिनिटांसाठी लॉक आहे. थोड्या वेळाने पुन्हा प्रयत्न करा.",
  },

  // Manager screens — shared outlet picker
  "manager.outlet": { en: "Outlet", hi: "आउटलेट", mr: "आउटलेट" },

  // /dashboard
  "manager.dashboardHeading": { en: "Dashboard", hi: "डैशबोर्ड", mr: "डॅशबोर्ड" },
  "manager.chooseOutletDashboard": {
    en: "Choose an outlet to see its checklists.",
    hi: "चेकलिस्ट देखने के लिए एक आउटलेट चुनें।",
    mr: "चेकलिस्ट पाहण्यासाठी एक आउटलेट निवडा.",
  },
  "manager.loadDashboardError": {
    en: "Couldn't load the dashboard: {error}",
    hi: "डैशबोर्ड लोड नहीं हो सका: {error}",
    mr: "डॅशबोर्ड लोड करता आले नाही: {error}",
  },
  "manager.notSubmittedYet": {
    en: "Not submitted yet",
    hi: "अभी सबमिट नहीं हुआ",
    mr: "अजून सबमिट झाले नाही",
  },
  "manager.checklistFallbackTitle": {
    en: "Checklist",
    hi: "चेकलिस्ट",
    mr: "चेकलिस्ट",
  },
  "manager.submittedAt": {
    en: "Submitted by {name} at {time}",
    hi: "{time} पर {name} द्वारा सबमिट किया गया",
    mr: "{time} वाजता {name} यांनी सबमिट केले",
  },

  // /history
  "manager.historyHeading": { en: "History", hi: "इतिहास", mr: "इतिहास" },
  "manager.chooseOutletHistory": {
    en: "Choose an outlet to see its history.",
    hi: "इतिहास देखने के लिए एक आउटलेट चुनें।",
    mr: "इतिहास पाहण्यासाठी एक आउटलेट निवडा.",
  },
  "manager.loadHistoryError": {
    en: "Couldn't load history: {error}",
    hi: "इतिहास लोड नहीं हो सका: {error}",
    mr: "इतिहास लोड करता आला नाही: {error}",
  },
  "manager.dateColumn": { en: "Date", hi: "तारीख", mr: "तारीख" },

  // Submission answers modal (dashboard + history)
  "manager.loadingAnswers": {
    en: "Loading answers…",
    hi: "जवाब लोड हो रहे हैं…",
    mr: "उत्तरे लोड होत आहेत…",
  },
  "manager.loadAnswersError": {
    en: "Couldn't load answers: {error}",
    hi: "जवाब लोड नहीं हो सके: {error}",
    mr: "उत्तरे लोड करता आली नाहीत: {error}",
  },
  "manager.itemDone": { en: "Done", hi: "पूरा हुआ", mr: "पूर्ण झाले" },
  "manager.itemNotDone": {
    en: "Not done",
    hi: "पूरा नहीं हुआ",
    mr: "पूर्ण झाले नाही",
  },
  "manager.note": { en: "Note: {note}", hi: "नोट: {note}", mr: "नोंद: {note}" },
  "manager.overallNotes": {
    en: "Overall notes",
    hi: "कुल नोट्स",
    mr: "एकूण नोंदी",
  },

  // /staff
  "manager.chooseOutletStaff": {
    en: "Choose an outlet to manage its staff.",
    hi: "स्टाफ प्रबंधित करने के लिए एक आउटलेट चुनें।",
    mr: "स्टाफ व्यवस्थापित करण्यासाठी एक आउटलेट निवडा.",
  },
  "manager.staffHeading": { en: "Staff", hi: "स्टाफ", mr: "स्टाफ" },
  "manager.addStaff": { en: "Add staff", hi: "स्टाफ जोड़ें", mr: "स्टाफ जोडा" },
  "manager.noStaffYet": {
    en: "No staff yet. Add your first staff member.",
    hi: "अभी कोई स्टाफ नहीं है। पहला स्टाफ सदस्य जोड़ें।",
    mr: "अजून कोणताही स्टाफ नाही. पहिला स्टाफ सदस्य जोडा.",
  },
  "manager.rename": { en: "Rename", hi: "नाम बदलें", mr: "नाव बदला" },
  "manager.inactive": { en: "Inactive", hi: "निष्क्रिय", mr: "निष्क्रिय" },
  "manager.lockedUntil": {
    en: "Locked until {time}",
    hi: "{time} तक लॉक है",
    mr: "{time} पर्यंत लॉक आहे",
  },
  "manager.resetPin": {
    en: "Reset PIN",
    hi: "पिन रीसेट करें",
    mr: "पिन रीसेट करा",
  },
  "manager.resetPinTitle": {
    en: "Reset PIN for {name}",
    hi: "{name} के लिए पिन रीसेट करें",
    mr: "{name} साठी पिन रीसेट करा",
  },
  "manager.deactivate": {
    en: "Deactivate",
    hi: "निष्क्रिय करें",
    mr: "निष्क्रिय करा",
  },
  "manager.activate": { en: "Activate", hi: "सक्रिय करें", mr: "सक्रिय करा" },
  "manager.pinLabel": {
    en: "PIN (4 to 6 digits)",
    hi: "पिन (4 से 6 अंक)",
    mr: "पिन (4 ते 6 अंक)",
  },
  "manager.pinMustBeDigits": {
    en: "PIN must be 4 to 6 digits.",
    hi: "पिन 4 से 6 अंकों का होना चाहिए।",
    mr: "पिन 4 ते 6 अंकी असावा.",
  },
  "manager.add": { en: "Add", hi: "जोड़ें", mr: "जोडा" },

  // /checklists
  "manager.chooseOutletChecklists": {
    en: "Choose an outlet to manage its checklists.",
    hi: "चेकलिस्ट प्रबंधित करने के लिए एक आउटलेट चुनें।",
    mr: "चेकलिस्ट व्यवस्थापित करण्यासाठी एक आउटलेट निवडा.",
  },
  "manager.newChecklist": {
    en: "New checklist",
    hi: "नई चेकलिस्ट",
    mr: "नवीन चेकलिस्ट",
  },
  "manager.noChecklistsYet": {
    en: "No checklists yet. Create your first one.",
    hi: "अभी कोई चेकलिस्ट नहीं है। अपनी पहली चेकलिस्ट बनाएं।",
    mr: "अजून कोणतीही चेकलिस्ट नाही. तुमची पहिली चेकलिस्ट तयार करा.",
  },
  "manager.active": { en: "Active", hi: "सक्रिय", mr: "सक्रिय" },
  "manager.kindOpening": { en: "Opening", hi: "ओपनिंग", mr: "ओपनिंग" },
  "manager.kindClosing": { en: "Closing", hi: "क्लोज़िंग", mr: "क्लोजिंग" },
  "manager.kindLabel": { en: "Kind", hi: "प्रकार", mr: "प्रकार" },
  "manager.create": { en: "Create", hi: "बनाएं", mr: "तयार करा" },
  "manager.creating": {
    en: "Creating…",
    hi: "बनाया जा रहा है…",
    mr: "तयार होत आहे…",
  },
  "manager.createError": {
    en: "Something went wrong. Please try again.",
    hi: "कुछ गड़बड़ हुई। कृपया फिर कोशिश करें।",
    mr: "काहीतरी चूक झाली. कृपया पुन्हा प्रयत्न करा.",
  },

  // /checklists/[templateId]
  "manager.loadTemplateError": {
    en: "Couldn't load this checklist: {error}",
    hi: "यह चेकलिस्ट लोड नहीं हो सकी: {error}",
    mr: "ही चेकलिस्ट लोड करता आली नाही: {error}",
  },
  "manager.addItem": { en: "Add item", hi: "आइटम जोड़ें", mr: "आयटम जोडा" },
  "manager.adding": { en: "Adding…", hi: "जोड़ा जा रहा है…", mr: "जोडत आहे…" },
  "manager.noItemsYet": {
    en: "No items yet. Add the first one.",
    hi: "अभी कोई आइटम नहीं है। पहला आइटम जोड़ें।",
    mr: "अजून कोणताही आयटम नाही. पहिला आयटम जोडा.",
  },
  "manager.labelEmpty": {
    en: "Label can't be empty.",
    hi: "लेबल खाली नहीं हो सकता।",
    mr: "लेबल रिकामे असू शकत नाही.",
  },
  "manager.edit": { en: "Edit", hi: "बदलें", mr: "बदला" },
  "manager.required": { en: "Required", hi: "आवश्यक", mr: "आवश्यक" },
  "manager.optional": { en: "Optional", hi: "वैकल्पिक", mr: "ऐच्छिक" },
  "manager.delete": { en: "Delete", hi: "हटाएं", mr: "काढा" },
  "manager.confirmDeleteItem": {
    en: "Delete \"{label}\"? Past submissions keep their own copy of this item.",
    hi: "\"{label}\" हटाएं? पुराने सबमिशन में इस आइटम की अपनी कॉपी बनी रहेगी।",
    mr: "\"{label}\" काढायचे? जुन्या सबमिशनमध्ये या आयटमची स्वतःची प्रत राहील.",
  },
  "manager.moveUp": { en: "Move up", hi: "ऊपर ले जाएं", mr: "वर न्या" },
  "manager.moveDown": { en: "Move down", hi: "नीचे ले जाएं", mr: "खाली न्या" },
} satisfies Record<string, Entry>;

export type TranslationKey = keyof typeof dictionary;

export function translate(locale: Locale, key: TranslationKey): string {
  return dictionary[key][locale] ?? dictionary[key].en;
}
