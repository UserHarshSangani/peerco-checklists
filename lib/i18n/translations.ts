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

  // /tablet — outlet & checklist list
  "tablet.switchOutlet": {
    en: "Switch outlet",
    hi: "आउटलेट बदलें",
    mr: "आउटलेट बदला",
  },
  "tablet.noOutlets": {
    en: "No outlets are assigned to your account yet.",
    hi: "अभी आपके खाते में कोई आउटलेट नहीं जोड़ा गया है।",
    mr: "अजून तुमच्या खात्याला कोणतेही आउटलेट नियुक्त केलेले नाही.",
  },
  "tablet.chooseOutlet": {
    en: "Choose an outlet",
    hi: "एक आउटलेट चुनें",
    mr: "एक आउटलेट निवडा",
  },
  "tablet.checklistsHeading": {
    en: "Checklists",
    hi: "चेकलिस्ट",
    mr: "चेकलिस्ट",
  },
  "tablet.loadingChecklists": {
    en: "Loading checklists…",
    hi: "चेकलिस्ट लोड हो रही हैं…",
    mr: "चेकलिस्ट लोड होत आहेत…",
  },
  "tablet.loadChecklistsError": {
    en: "Couldn't load checklists: {error}",
    hi: "चेकलिस्ट लोड नहीं हो सकीं: {error}",
    mr: "चेकलिस्ट लोड करता आल्या नाहीत: {error}",
  },
  "tablet.noActiveChecklists": {
    en: "No active checklists for this outlet.",
    hi: "इस आउटलेट के लिए कोई सक्रिय चेकलिस्ट नहीं है।",
    mr: "या आउटलेटसाठी कोणतीही सक्रिय चेकलिस्ट नाही.",
  },

  // /tablet — checklist detail
  "tablet.backToChecklists": {
    en: "Back to checklists",
    hi: "चेकलिस्ट पर वापस जाएं",
    mr: "चेकलिस्टवर परत जा",
  },
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
  "tablet.loadStaffError": {
    en: "Couldn't load staff: {error}",
    hi: "स्टाफ लोड नहीं हो सका: {error}",
    mr: "स्टाफ लोड करता आला नाही: {error}",
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
} satisfies Record<string, Entry>;

export type TranslationKey = keyof typeof dictionary;

export function translate(locale: Locale, key: TranslationKey): string {
  return dictionary[key][locale] ?? dictionary[key].en;
}
