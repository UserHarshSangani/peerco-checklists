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
  "common.continue": { en: "Continue", hi: "जारी रखें", mr: "सुरू ठेवा" },

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
  "nav.outlets": { en: "Outlets", hi: "आउटलेट", mr: "आउटलेट" },
  "nav.catalog": { en: "Catalog", hi: "कैटलॉग", mr: "कॅटलॉग" },
  "nav.stock": { en: "Stock", hi: "स्टॉक", mr: "स्टॉक" },
  "nav.recipes": { en: "Recipes", hi: "रेसिपी", mr: "रेसिपी" },
  "nav.sales": { en: "Sales", hi: "बिक्री", mr: "विक्री" },
  "nav.mapping": { en: "Mapping", hi: "मैपिंग", mr: "मॅपिंग" },
  "nav.variance": { en: "Variance", hi: "वेरिएंस", mr: "व्हेरियन्स" },

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
  "tablet.takePhoto": { en: "Take photo", hi: "फोटो लें", mr: "फोटो घ्या" },
  "tablet.retakePhoto": {
    en: "Retake photo",
    hi: "फिर से फोटो लें",
    mr: "पुन्हा फोटो घ्या",
  },
  "tablet.uploadingPhoto": {
    en: "Uploading…",
    hi: "अपलोड हो रहा है…",
    mr: "अपलोड होत आहे…",
  },
  "tablet.photoUploaded": {
    en: "Uploaded",
    hi: "अपलोड हो गया",
    mr: "अपलोड झाले",
  },
  "tablet.photoUploadFailed": {
    en: "Upload failed",
    hi: "अपलोड नहीं हो सका",
    mr: "अपलोड झाले नाही",
  },
  "tablet.nonTouchHint": {
    en: "On a tablet or phone this opens the camera",
    hi: "टैबलेट या फ़ोन पर यह कैमरा खोलता है",
    mr: "टॅबलेट किंवा फोनवर यामुळे कॅमेरा उघडतो",
  },
  "tablet.photoNeeded": {
    en: "Photo needed: {labels}",
    hi: "फोटो चाहिए: {labels}",
    mr: "फोटो हवा: {labels}",
  },
  "tablet.photoNeededInline": {
    en: "A photo is needed for this item.",
    hi: "इस आइटम के लिए फोटो चाहिए।",
    mr: "या आयटमसाठी फोटो हवा आहे.",
  },
  "tablet.photoPreviewAlt": {
    en: "Photo preview",
    hi: "फोटो प्रीव्यू",
    mr: "फोटो प्रीव्ह्यू",
  },

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
  "tablet.reason.missing_photo": {
    en: "Please retake the photo and try again.",
    hi: "कृपया फिर से फोटो लें और कोशिश करें।",
    mr: "कृपया पुन्हा फोटो घ्या आणि प्रयत्न करा.",
  },
  "tablet.reason.invalid_photo": {
    en: "Please retake the photo and try again.",
    hi: "कृपया फिर से फोटो लें और कोशिश करें।",
    mr: "कृपया पुन्हा फोटो घ्या आणि प्रयत्न करा.",
  },
  "tablet.reason.bad_quantity": {
    en: "One or more quantities are not valid.",
    hi: "एक या अधिक मात्राएं सही नहीं हैं।",
    mr: "एक किंवा अधिक प्रमाणे बरोबर नाहीत.",
  },
  "tablet.reason.duplicate_item": {
    en: "The same item appears more than once.",
    hi: "एक ही आइटम एक से ज़्यादा बार है।",
    mr: "तोच आयटम एकापेक्षा जास्त वेळा आहे.",
  },
  "tablet.reason.invalid_item": {
    en: "Some items are no longer available. The list has been refreshed — please check it and try again.",
    hi: "कुछ आइटम अब उपलब्ध नहीं हैं। सूची फिर से लोड कर दी गई है — कृपया इसे जांचें और फिर कोशिश करें।",
    mr: "काही आयटम आता उपलब्ध नाहीत. यादी पुन्हा लोड केली आहे — कृपया ती तपासा आणि पुन्हा प्रयत्न करा.",
  },
  "tablet.reason.incomplete": {
    en: "Please enter a quantity for every item. The list has been refreshed — please check it and try again.",
    hi: "कृपया हर आइटम के लिए मात्रा डालें। सूची फिर से लोड कर दी गई है — कृपया इसे जांचें और फिर कोशिश करें।",
    mr: "कृपया प्रत्येक आयटमसाठी प्रमाण टाका. यादी पुन्हा लोड केली आहे — कृपया ती तपासा आणि पुन्हा प्रयत्न करा.",
  },
  "tablet.reason.invalid_vendor": {
    en: "Please choose a valid vendor.",
    hi: "कृपया एक सही वेंडर चुनें।",
    mr: "कृपया योग्य विक्रेता निवडा.",
  },
  "tablet.reason.bad_reason": {
    en: "Please choose a valid reason.",
    hi: "कृपया एक सही कारण चुनें।",
    mr: "कृपया योग्य कारण निवडा.",
  },
  "tablet.reason.note_required": {
    en: "A note is required when the reason is \"Other\".",
    hi: "कारण \"अन्य\" होने पर नोट ज़रूरी है।",
    mr: "कारण \"इतर\" असल्यास नोंद आवश्यक आहे.",
  },
  "tablet.checkingLocation": {
    en: "Checking location…",
    hi: "स्थान की जांच हो रही है…",
    mr: "स्थान तपासले जात आहे…",
  },
  "tablet.locationExplainerBody": {
    en: "When you submit, we check whether this device is at the outlet. Your exact location is not saved.",
    hi: "जब आप सबमिट करते हैं, तो हम जांचते हैं कि यह डिवाइस आउटलेट पर है या नहीं। आपका सटीक स्थान सेव नहीं किया जाता।",
    mr: "तुम्ही सबमिट करता तेव्हा, हे डिव्हाइस आउटलेटवर आहे की नाही हे आम्ही तपासतो. तुमचे नेमके स्थान सेव्ह केले जात नाही.",
  },
  "tablet.locationOffHint": {
    en: "Location is off. Please allow location for this app in your browser settings.",
    hi: "लोकेशन बंद है। कृपया अपनी ब्राउज़र सेटिंग्स में इस ऐप के लिए लोकेशन की अनुमति दें।",
    mr: "लोकेशन बंद आहे. कृपया तुमच्या ब्राउझर सेटिंग्जमध्ये या अ‍ॅपसाठी लोकेशनला परवानगी द्या.",
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
  "manager.viewPhoto": { en: "View photo", hi: "फोटो देखें", mr: "फोटो पहा" },
  "manager.photoUnavailable": {
    en: "Photo unavailable",
    hi: "फोटो उपलब्ध नहीं है",
    mr: "फोटो उपलब्ध नाही",
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
  "manager.photoRequiredToggle": {
    en: "Photo required",
    hi: "फोटो आवश्यक",
    mr: "फोटो आवश्यक",
  },

  // Location status badge (dashboard cards, history cells, answers view)
  "location.inside": { en: "At outlet", hi: "आउटलेट पर", mr: "आउटलेटवर" },
  "location.outside": {
    en: "Outside outlet ({distance})",
    hi: "आउटलेट से बाहर ({distance})",
    mr: "आउटलेटच्या बाहेर ({distance})",
  },
  "location.lowAccuracy": {
    en: "Location uncertain",
    hi: "स्थान अनिश्चित है",
    mr: "स्थान अनिश्चित आहे",
  },
  "location.denied": {
    en: "Location blocked",
    hi: "लोकेशन ब्लॉक है",
    mr: "लोकेशन ब्लॉक आहे",
  },
  "location.unavailable": {
    en: "Location unavailable",
    hi: "लोकेशन उपलब्ध नहीं",
    mr: "लोकेशन उपलब्ध नाही",
  },
  "location.notConfigured": {
    en: "Outlet location not set",
    hi: "आउटलेट का स्थान सेट नहीं है",
    mr: "आउटलेटचे स्थान सेट केलेले नाही",
  },
  "location.showOnlyFlagged": {
    en: "Show only flagged",
    hi: "केवल फ़्लैग की गई दिखाएं",
    mr: "फक्त फ्लॅग केलेले दाखवा",
  },

  // /outlets (peerco_admin, owner only)
  "outlets.heading": { en: "Outlets", hi: "आउटलेट", mr: "आउटलेट" },
  "outlets.locationSet": {
    en: "Location set - radius {radius} m",
    hi: "स्थान सेट है - त्रिज्या {radius} मी",
    mr: "स्थान सेट आहे - त्रिज्या {radius} मी",
  },
  "outlets.locationNotSet": {
    en: "Not set",
    hi: "सेट नहीं है",
    mr: "सेट केलेले नाही",
  },
  "outlets.loadError": {
    en: "Couldn't load outlets: {error}",
    hi: "आउटलेट लोड नहीं हो सके: {error}",
    mr: "आउटलेट लोड करता आले नाहीत: {error}",
  },
  "outlets.backToOutlets": {
    en: "Back to outlets",
    hi: "आउटलेट पर वापस जाएं",
    mr: "आउटलेटवर परत जा",
  },
  "outlets.loadOutletError": {
    en: "Couldn't load this outlet: {error}",
    hi: "यह आउटलेट लोड नहीं हो सका: {error}",
    mr: "हा आउटलेट लोड करता आला नाही: {error}",
  },
  "outlets.useMyLocation": {
    en: "Use my current location",
    hi: "मेरा वर्तमान स्थान उपयोग करें",
    mr: "माझे सध्याचे स्थान वापरा",
  },
  "outlets.locating": {
    en: "Getting your location…",
    hi: "आपका स्थान प्राप्त किया जा रहा है…",
    mr: "तुमचे स्थान मिळवले जात आहे…",
  },
  "outlets.accuracyLabel": {
    en: "Accuracy: ~{accuracy} m",
    hi: "सटीकता: ~{accuracy} मी",
    mr: "अचूकता: ~{accuracy} मी",
  },
  "outlets.accuracyWarning": {
    en: "Move near a window or outdoors and try again.",
    hi: "खिड़की के पास या बाहर जाकर फिर कोशिश करें।",
    mr: "खिडकीजवळ किंवा बाहेर जाऊन पुन्हा प्रयत्न करा.",
  },
  "outlets.pasteCoordinatesLabel": {
    en: "Paste coordinates",
    hi: "निर्देशांक पेस्ट करें",
    mr: "निर्देशांक पेस्ट करा",
  },
  "outlets.pasteCoordinatesPlaceholder": {
    en: "18.5362, 73.8940",
    hi: "18.5362, 73.8940",
    mr: "18.5362, 73.8940",
  },
  "outlets.pasteCoordinatesError": {
    en: 'Enter coordinates like "18.5362, 73.8940".',
    hi: '"18.5362, 73.8940" जैसे निर्देशांक डालें।',
    mr: '"18.5362, 73.8940" सारखे निर्देशांक टाका.',
  },
  "outlets.radiusLabel": {
    en: "Radius (metres)",
    hi: "त्रिज्या (मीटर)",
    mr: "त्रिज्या (मीटर)",
  },
  "outlets.radiusHint": {
    en: "GPS indoors can be off by 30 to 100 m. 150 m works for most outlets.",
    hi: "घर के अंदर GPS 30 से 100 मी तक गलत हो सकता है। ज़्यादातर आउटलेट के लिए 150 मी ठीक रहता है।",
    mr: "घरामध्ये GPS 30 ते 100 मी पर्यंत चुकीचे असू शकते. बहुतेक आउटलेटसाठी 150 मी योग्य असते.",
  },
  "outlets.radiusError": {
    en: "Radius must be between 30 and 1000 m.",
    hi: "त्रिज्या 30 से 1000 मी के बीच होनी चाहिए।",
    mr: "त्रिज्या 30 ते 1000 मी दरम्यान असावी.",
  },
  "outlets.openInGoogleMaps": {
    en: "Open in Google Maps",
    hi: "Google Maps में खोलें",
    mr: "Google Maps मध्ये उघडा",
  },
  "outlets.clearLocation": {
    en: "Clear location",
    hi: "स्थान हटाएं",
    mr: "स्थान काढा",
  },
  "outlets.confirmClearLocation": {
    en: "Clear this outlet's saved location?",
    hi: "इस आउटलेट का सेव किया गया स्थान हटाएं?",
    mr: "या आउटलेटचे सेव्ह केलेले स्थान काढायचे?",
  },
  "outlets.saveSuccess": {
    en: "Location saved.",
    hi: "स्थान सेव हो गया।",
    mr: "स्थान सेव्ह झाले.",
  },
  "outlets.locationCleared": {
    en: "Location cleared.",
    hi: "स्थान हटा दिया गया।",
    mr: "स्थान काढले गेले.",
  },
  "outlets.locationDenied": {
    en: "Location access is blocked. Allow location for this site in your browser settings.",
    hi: "लोकेशन एक्सेस ब्लॉक है। अपनी ब्राउज़र सेटिंग्स में इस साइट के लिए लोकेशन की अनुमति दें।",
    mr: "लोकेशन अ‍ॅक्सेस ब्लॉक आहे. तुमच्या ब्राउझर सेटिंग्जमध्ये या साइटसाठी लोकेशनला परवानगी द्या.",
  },
  "outlets.locationUnavailable": {
    en: "Couldn't get your location. Try again.",
    hi: "आपका स्थान नहीं मिल सका। फिर कोशिश करें।",
    mr: "तुमचे स्थान मिळू शकले नाही. पुन्हा प्रयत्न करा.",
  },
  "outlets.noLocationSet": {
    en: "No location set yet.",
    hi: "अभी कोई स्थान सेट नहीं है।",
    mr: "अजून कोणतेही स्थान सेट केलेले नाही.",
  },
  "outlets.weeklyCountDayLabel": {
    en: "Weekly count day",
    hi: "साप्ताहिक गिनती का दिन",
    mr: "साप्ताहिक मोजणीचा दिवस",
  },
  "outlets.weeklyCountDaySaved": {
    en: "Weekly count day saved.",
    hi: "साप्ताहिक गिनती का दिन सेव हो गया।",
    mr: "साप्ताहिक मोजणीचा दिवस सेव्ह झाला.",
  },
  "outlets.weekday.sunday": { en: "Sunday", hi: "रविवार", mr: "रविवार" },
  "outlets.weekday.monday": { en: "Monday", hi: "सोमवार", mr: "सोमवार" },
  "outlets.weekday.tuesday": { en: "Tuesday", hi: "मंगलवार", mr: "मंगळवार" },
  "outlets.weekday.wednesday": { en: "Wednesday", hi: "बुधवार", mr: "बुधवार" },
  "outlets.weekday.thursday": { en: "Thursday", hi: "गुरुवार", mr: "गुरुवार" },
  "outlets.weekday.friday": { en: "Friday", hi: "शुक्रवार", mr: "शुक्रवार" },
  "outlets.weekday.saturday": { en: "Saturday", hi: "शनिवार", mr: "शनिवार" },

  // /tablet — home tiles (Checklists, Stock count, Goods received, Wastage)
  "tablet.home.heading": {
    en: "What would you like to do?",
    hi: "आप क्या करना चाहते हैं?",
    mr: "तुम्हाला काय करायचे आहे?",
  },
  "tablet.home.checklists": {
    en: "Checklists",
    hi: "चेकलिस्ट",
    mr: "चेकलिस्ट",
  },
  "tablet.home.stockCount": {
    en: "Stock count",
    hi: "स्टॉक गिनती",
    mr: "स्टॉक मोजणी",
  },
  "tablet.home.goodsReceived": {
    en: "Goods received",
    hi: "माल प्राप्त",
    mr: "माल मिळाला",
  },
  "tablet.home.wastage": { en: "Wastage", hi: "बर्बादी", mr: "वाया गेलेला माल" },

  // /tablet — stock count flow
  "tablet.stock.countTitle": {
    en: "Stock count",
    hi: "स्टॉक गिनती",
    mr: "स्टॉक मोजणी",
  },
  "tablet.stock.chooseKind": {
    en: "What kind of count is this?",
    hi: "यह किस तरह की गिनती है?",
    mr: "ही कोणत्या प्रकारची मोजणी आहे?",
  },
  "tablet.stock.openingCount": {
    en: "Opening count",
    hi: "ओपनिंग गिनती",
    mr: "ओपनिंग मोजणी",
  },
  "tablet.stock.closingCount": {
    en: "Closing count",
    hi: "क्लोज़िंग गिनती",
    mr: "क्लोजिंग मोजणी",
  },
  "tablet.stock.today": { en: "Today", hi: "आज", mr: "आज" },
  "tablet.stock.yesterday": { en: "Yesterday", hi: "कल", mr: "काल" },
  "tablet.stock.loadSheetError": {
    en: "Couldn't load the count sheet: {error}",
    hi: "गिनती शीट लोड नहीं हो सकी: {error}",
    mr: "मोजणी शीट लोड करता आली नाही: {error}",
  },
  "tablet.stock.loadEntryListsError": {
    en: "Couldn't load items: {error}",
    hi: "आइटम लोड नहीं हो सके: {error}",
    mr: "आयटम लोड करता आले नाहीत: {error}",
  },
  "tablet.stock.noItemsToCount": {
    en: "No items to count for this outlet today.",
    hi: "आज इस आउटलेट के लिए गिनने के लिए कोई आइटम नहीं है।",
    mr: "आज या आउटलेटसाठी मोजण्यासाठी कोणताही आयटम नाही.",
  },
  "tablet.stock.uncategorized": {
    en: "Other",
    hi: "अन्य",
    mr: "इतर",
  },
  "tablet.stock.addNote": {
    en: "+ Add note",
    hi: "+ नोट जोड़ें",
    mr: "+ नोंद जोडा",
  },
  "tablet.stock.notePlaceholder": {
    en: "Note (optional)",
    hi: "नोट (वैकल्पिक)",
    mr: "नोंद (ऐच्छिक)",
  },
  "tablet.stock.countedProgress": {
    en: "{done} of {total} counted",
    hi: "{total} में से {done} गिने गए",
    mr: "{total} पैकी {done} मोजले",
  },
  "tablet.stock.items": { en: "Items", hi: "आइटम", mr: "आयटम" },
  "tablet.stock.addItem": {
    en: "Add item",
    hi: "आइटम जोड़ें",
    mr: "आयटम जोडा",
  },
  "tablet.stock.removeItem": {
    en: "Remove",
    hi: "हटाएं",
    mr: "काढा",
  },
  "tablet.stock.searchItems": {
    en: "Search items…",
    hi: "आइटम खोजें…",
    mr: "आयटम शोधा…",
  },
  "tablet.stock.noItemsFound": {
    en: "No items found.",
    hi: "कोई आइटम नहीं मिला।",
    mr: "कोणताही आयटम सापडला नाही.",
  },
  "tablet.stock.quantityLabel": {
    en: "Qty",
    hi: "मात्रा",
    mr: "प्रमाण",
  },

  // /tablet — goods received flow
  "tablet.receipt.title": {
    en: "Goods received",
    hi: "माल प्राप्त",
    mr: "माल मिळाला",
  },
  "tablet.receipt.chooseVendor": {
    en: "Choose a vendor",
    hi: "एक वेंडर चुनें",
    mr: "एक विक्रेता निवडा",
  },
  "tablet.receipt.noVendors": {
    en: "No vendors set up for this outlet's brand yet.",
    hi: "इस आउटलेट के ब्रांड के लिए अभी कोई वेंडर सेट नहीं है।",
    mr: "या आउटलेटच्या ब्रँडसाठी अजून कोणताही विक्रेता सेट केलेला नाही.",
  },
  "tablet.receipt.invoiceRefLabel": {
    en: "Invoice number (optional)",
    hi: "इनवॉइस नंबर (वैकल्पिक)",
    mr: "इनव्हॉइस क्रमांक (ऐच्छिक)",
  },
  "tablet.receipt.unitCostLabel": {
    en: "Cost/unit",
    hi: "लागत/यूनिट",
    mr: "किंमत/युनिट",
  },
  "tablet.receipt.noItemsYet": {
    en: "No items added yet.",
    hi: "अभी कोई आइटम नहीं जोड़ा गया।",
    mr: "अजून कोणताही आयटम जोडलेला नाही.",
  },
  "tablet.receipt.photoLabel": {
    en: "Invoice photo (optional)",
    hi: "इनवॉइस फोटो (वैकल्पिक)",
    mr: "इनव्हॉइस फोटो (ऐच्छिक)",
  },

  // /tablet — wastage flow
  "tablet.wastage.title": { en: "Wastage", hi: "बर्बादी", mr: "वाया गेलेला माल" },
  "tablet.wastage.addEntry": {
    en: "Add entry",
    hi: "एंट्री जोड़ें",
    mr: "नोंद जोडा",
  },
  "tablet.wastage.noEntriesYet": {
    en: "No entries added yet.",
    hi: "अभी कोई एंट्री नहीं जोड़ी गई।",
    mr: "अजून कोणतीही नोंद जोडलेली नाही.",
  },
  "tablet.wastage.reasonLabel": {
    en: "Reason",
    hi: "कारण",
    mr: "कारण",
  },
  "tablet.wastage.notePlaceholder": {
    en: "Note (optional)",
    hi: "नोट (वैकल्पिक)",
    mr: "नोंद (ऐच्छिक)",
  },
  "tablet.wastage.noteRequiredHint": {
    en: "A note is required for \"Other\".",
    hi: "\"अन्य\" के लिए नोट ज़रूरी है।",
    mr: "\"इतर\" साठी नोंद आवश्यक आहे.",
  },
  "tablet.wastage.reason.spoilage": {
    en: "Spoilage",
    hi: "खराब हुआ",
    mr: "खराब झाले",
  },
  "tablet.wastage.reason.prep_waste": {
    en: "Prep waste",
    hi: "तैयारी में बर्बादी",
    mr: "तयारीत वाया गेले",
  },
  "tablet.wastage.reason.breakage": {
    en: "Breakage",
    hi: "टूट-फूट",
    mr: "तुटले/फुटले",
  },
  "tablet.wastage.reason.staff_meal": {
    en: "Staff meal",
    hi: "स्टाफ भोजन",
    mr: "स्टाफ जेवण",
  },
  "tablet.wastage.reason.complimentary": {
    en: "Complimentary",
    hi: "मुफ़्त में दिया गया",
    mr: "मोफत दिले",
  },
  "tablet.wastage.reason.other": { en: "Other", hi: "अन्य", mr: "इतर" },

  // /catalog (peerco_admin, owner, manager)
  "catalog.heading": { en: "Catalog", hi: "कैटलॉग", mr: "कॅटलॉग" },
  "catalog.chooseOutlet": {
    en: "Choose an outlet to manage its catalog.",
    hi: "कैटलॉग प्रबंधित करने के लिए एक आउटलेट चुनें।",
    mr: "कॅटलॉग व्यवस्थापित करण्यासाठी एक आउटलेट निवडा.",
  },
  "catalog.brandLabel": {
    en: "Brand: {brand}",
    hi: "ब्रांड: {brand}",
    mr: "ब्रँड: {brand}",
  },
  "catalog.itemsTab": { en: "Items", hi: "आइटम", mr: "आयटम" },
  "catalog.vendorsTab": { en: "Vendors", hi: "वेंडर", mr: "विक्रेते" },
  "catalog.outletSettingsTab": {
    en: "Outlet settings",
    hi: "आउटलेट सेटिंग्स",
    mr: "आउटलेट सेटिंग्ज",
  },
  "catalog.searchItemsPlaceholder": {
    en: "Search by name, category or vendor…",
    hi: "नाम, श्रेणी या वेंडर से खोजें…",
    mr: "नाव, श्रेणी किंवा विक्रेत्यानुसार शोधा…",
  },
  "catalog.addItem": { en: "Add item", hi: "आइटम जोड़ें", mr: "आयटम जोडा" },
  "catalog.editItem": { en: "Edit item", hi: "आइटम बदलें", mr: "आयटम बदला" },
  "catalog.noItemsYet": {
    en: "No items yet.",
    hi: "अभी कोई आइटम नहीं है।",
    mr: "अजून कोणताही आयटम नाही.",
  },
  "catalog.loadItemsError": {
    en: "Couldn't load items: {error}",
    hi: "आइटम लोड नहीं हो सके: {error}",
    mr: "आयटम लोड करता आले नाहीत: {error}",
  },
  "catalog.duplicateItemName": {
    en: "An item with this name already exists.",
    hi: "इस नाम का आइटम पहले से मौजूद है।",
    mr: "या नावाचा आयटम आधीच अस्तित्वात आहे.",
  },
  "catalog.countUnitRequired": {
    en: "Count unit can't be empty.",
    hi: "गिनती इकाई खाली नहीं हो सकती।",
    mr: "मोजणी युनिट रिकामे असू शकत नाही.",
  },
  "catalog.categoryLabel": { en: "Category", hi: "श्रेणी", mr: "श्रेणी" },
  "catalog.countUnitLabel": {
    en: "Count unit",
    hi: "गिनती इकाई",
    mr: "मोजणी युनिट",
  },
  "catalog.orderUnitLabel": {
    en: "Order unit",
    hi: "ऑर्डर इकाई",
    mr: "ऑर्डर युनिट",
  },
  "catalog.orderUnitSizeLabel": {
    en: "Order unit size",
    hi: "ऑर्डर इकाई आकार",
    mr: "ऑर्डर युनिट आकार",
  },
  "catalog.unitPlaceholder": {
    en: "e.g. kg, pack, box",
    hi: "जैसे kg, pack, box",
    mr: "उदा. kg, pack, box",
  },
  "catalog.costPerUnitLabel": {
    en: "Cost/unit (₹)",
    hi: "लागत/यूनिट (₹)",
    mr: "किंमत/युनिट (₹)",
  },
  "catalog.vendorLabel": { en: "Vendor", hi: "वेंडर", mr: "विक्रेता" },
  "catalog.noVendor": { en: "No vendor", hi: "कोई वेंडर नहीं", mr: "विक्रेता नाही" },
  "catalog.countFrequencyLabel": {
    en: "Count frequency",
    hi: "गिनती की आवृत्ति",
    mr: "मोजणीची वारंवारता",
  },
  "catalog.frequencyDaily": { en: "Daily", hi: "रोज़ाना", mr: "दररोज" },
  "catalog.frequencyWeekly": { en: "Weekly", hi: "साप्ताहिक", mr: "साप्ताहिक" },
  "catalog.addVendor": { en: "Add vendor", hi: "वेंडर जोड़ें", mr: "विक्रेता जोडा" },
  "catalog.editVendor": { en: "Edit vendor", hi: "वेंडर बदलें", mr: "विक्रेता बदला" },
  "catalog.noVendorsYet": {
    en: "No vendors yet.",
    hi: "अभी कोई वेंडर नहीं है।",
    mr: "अजून कोणताही विक्रेता नाही.",
  },
  "catalog.loadVendorsError": {
    en: "Couldn't load vendors: {error}",
    hi: "वेंडर लोड नहीं हो सके: {error}",
    mr: "विक्रेते लोड करता आले नाहीत: {error}",
  },
  "catalog.duplicateVendorName": {
    en: "A vendor with this name already exists.",
    hi: "इस नाम का वेंडर पहले से मौजूद है।",
    mr: "या नावाचा विक्रेता आधीच अस्तित्वात आहे.",
  },
  "catalog.phoneLabel": { en: "Phone", hi: "फ़ोन", mr: "फोन" },
  "catalog.notesLabel": { en: "Notes", hi: "नोट्स", mr: "नोंदी" },
  "catalog.outletSettings.stockedHere": {
    en: "Stocked here",
    hi: "यहां स्टॉक किया गया",
    mr: "इथे स्टॉक केले",
  },
  "catalog.outletSettings.stocked": {
    en: "Stocked",
    hi: "स्टॉक किया गया",
    mr: "स्टॉक केले",
  },
  "catalog.outletSettings.notStocked": {
    en: "Not stocked",
    hi: "स्टॉक नहीं किया गया",
    mr: "स्टॉक केलेले नाही",
  },
  "catalog.outletSettings.parLevel": {
    en: "Par level",
    hi: "पार लेवल",
    mr: "पार लेव्हल",
  },
  "catalog.outletSettings.maxLevel": {
    en: "Max level",
    hi: "मैक्स लेवल",
    mr: "मॅक्स लेव्हल",
  },
  "catalog.outletSettings.leadTimeDays": {
    en: "Lead time (days)",
    hi: "लीड टाइम (दिन)",
    mr: "लीड टाइम (दिवस)",
  },
  "catalog.outletSettings.leadTimeError": {
    en: "Lead time must be between 0 and 60 days.",
    hi: "लीड टाइम 0 से 60 दिनों के बीच होना चाहिए।",
    mr: "लीड टाइम 0 ते 60 दिवसांदरम्यान असावा.",
  },
  "catalog.outletSettings.addAll": {
    en: "Add all items to this outlet",
    hi: "सभी आइटम इस आउटलेट में जोड़ें",
    mr: "सर्व आयटम या आउटलेटमध्ये जोडा",
  },
  "catalog.outletSettings.saved": {
    en: "Saved.",
    hi: "सेव हो गया।",
    mr: "सेव्ह झाले.",
  },
  "catalog.import.button": {
    en: "Bulk import",
    hi: "बल्क इंपोर्ट",
    mr: "बल्क इंपोर्ट",
  },
  "catalog.import.title": {
    en: "Bulk import items",
    hi: "आइटम बल्क इंपोर्ट करें",
    mr: "आयटम बल्क इंपोर्ट करा",
  },
  "catalog.import.downloadTemplate": {
    en: "Download CSV template",
    hi: "CSV टेम्पलेट डाउनलोड करें",
    mr: "CSV टेम्प्लेट डाउनलोड करा",
  },
  "catalog.import.chooseFile": {
    en: "Choose CSV file",
    hi: "CSV फ़ाइल चुनें",
    mr: "CSV फाइल निवडा",
  },
  "catalog.import.previewSummary": {
    en: "{valid} row(s) ready to import, {invalid} with errors.",
    hi: "{valid} पंक्ति(यां) इंपोर्ट के लिए तैयार, {invalid} में गड़बड़ी है।",
    mr: "{valid} ओळ(ी) इंपोर्टसाठी तयार, {invalid} मध्ये त्रुटी आहेत.",
  },
  "catalog.import.statusColumn": {
    en: "Status",
    hi: "स्थिति",
    mr: "स्थिती",
  },
  "catalog.import.ok": { en: "OK", hi: "ठीक है", mr: "ठीक आहे" },
  "catalog.import.errorName": {
    en: "Name is required.",
    hi: "नाम ज़रूरी है।",
    mr: "नाव आवश्यक आहे.",
  },
  "catalog.import.errorDuplicateInFile": {
    en: "Duplicate name in this file.",
    hi: "इस फ़ाइल में यह नाम दोहराया गया है।",
    mr: "या फाइलमध्ये हे नाव पुन्हा आले आहे.",
  },
  "catalog.import.errorCountUnit": {
    en: "Count unit is required.",
    hi: "गिनती इकाई ज़रूरी है।",
    mr: "मोजणी युनिट आवश्यक आहे.",
  },
  "catalog.import.errorFrequency": {
    en: "Count frequency must be \"daily\" or \"weekly\".",
    hi: "गिनती की आवृत्ति \"daily\" या \"weekly\" होनी चाहिए।",
    mr: "मोजणीची वारंवारता \"daily\" किंवा \"weekly\" असावी.",
  },
  "catalog.import.errorOrderUnitSize": {
    en: "Order unit size must be a number greater than 0.",
    hi: "ऑर्डर इकाई आकार 0 से बड़ी संख्या होनी चाहिए।",
    mr: "ऑर्डर युनिट आकार 0 पेक्षा मोठी संख्या असावी.",
  },
  "catalog.import.errorCostPerUnit": {
    en: "Cost/unit must be a number of 0 or more.",
    hi: "लागत/यूनिट 0 या उससे बड़ी संख्या होनी चाहिए।",
    mr: "किंमत/युनिट 0 किंवा त्यापेक्षा मोठी संख्या असावी.",
  },
  "catalog.import.errorEmptyFile": {
    en: "This file doesn't have any rows.",
    hi: "इस फ़ाइल में कोई पंक्ति नहीं है।",
    mr: "या फाइलमध्ये कोणतीही ओळ नाही.",
  },
  "catalog.import.confirm": {
    en: "Confirm import",
    hi: "इंपोर्ट की पुष्टि करें",
    mr: "इंपोर्टची पुष्टी करा",
  },
  "catalog.import.summary": {
    en: "{created} item(s) created, {updated} updated, {skipped} skipped.",
    hi: "{created} आइटम बनाए गए, {updated} अपडेट हुए, {skipped} छोड़े गए।",
    mr: "{created} आयटम तयार केले, {updated} अपडेट केले, {skipped} वगळले.",
  },

  // /stock (peerco_admin, owner, manager)
  "stock.heading": { en: "Stock", hi: "स्टॉक", mr: "स्टॉक" },
  "stock.chooseOutlet": {
    en: "Choose an outlet to see its stock activity.",
    hi: "स्टॉक गतिविधि देखने के लिए एक आउटलेट चुनें।",
    mr: "स्टॉक क्रियाकलाप पाहण्यासाठी एक आउटलेट निवडा.",
  },
  "stock.dateLabel": { en: "Date", hi: "तारीख", mr: "तारीख" },
  "stock.countsTab": { en: "Counts", hi: "गिनती", mr: "मोजणी" },
  "stock.receiptsTab": { en: "Receipts", hi: "रसीदें", mr: "पावत्या" },
  "stock.wastageTab": { en: "Wastage", hi: "बर्बादी", mr: "वाया गेलेला माल" },
  "stock.loadError": {
    en: "Couldn't load this: {error}",
    hi: "यह लोड नहीं हो सका: {error}",
    mr: "हे लोड करता आले नाही: {error}",
  },
  "stock.noSubmissions": {
    en: "Not submitted yet.",
    hi: "अभी सबमिट नहीं हुआ।",
    mr: "अजून सबमिट झाले नाही.",
  },
  "stock.openingVsClosing": {
    en: "Opening vs closing",
    hi: "ओपनिंग बनाम क्लोज़िंग",
    mr: "ओपनिंग वि. क्लोजिंग",
  },
  "stock.difference": { en: "Difference", hi: "अंतर", mr: "फरक" },
  "stock.overnightGap": {
    en: "Overnight gap",
    hi: "रात भर का अंतर",
    mr: "रात्रीचा फरक",
  },
  "stock.overnightGapHint": {
    en: "Yesterday's closing count compared with today's opening count.",
    hi: "कल की क्लोज़िंग गिनती की आज की ओपनिंग गिनती से तुलना।",
    mr: "कालच्या क्लोजिंग मोजणीची आजच्या ओपनिंग मोजणीशी तुलना.",
  },
  "stock.yesterdayClosing": {
    en: "Yesterday's closing",
    hi: "कल की क्लोज़िंग",
    mr: "कालचे क्लोजिंग",
  },
  "stock.todayOpening": {
    en: "Today's opening",
    hi: "आज की ओपनिंग",
    mr: "आजचे ओपनिंग",
  },
  "stock.noReceipts": {
    en: "No receipts for this date.",
    hi: "इस तारीख के लिए कोई रसीद नहीं है।",
    mr: "या तारखेसाठी कोणतीही पावती नाही.",
  },
  "stock.invoiceRef": {
    en: "Invoice #{ref}",
    hi: "इनवॉइस #{ref}",
    mr: "इनव्हॉइस #{ref}",
  },
  "stock.noWastage": {
    en: "No wastage logged for this date.",
    hi: "इस तारीख के लिए कोई बर्बादी दर्ज नहीं है।",
    mr: "या तारखेसाठी कोणताही वाया गेलेला माल नोंदवलेला नाही.",
  },
  "stock.reasonColumn": { en: "Reason", hi: "कारण", mr: "कारण" },
  "stock.entriesColumn": { en: "Entries", hi: "एंट्री", mr: "नोंदी" },
  "stock.valueColumn": { en: "Value", hi: "मूल्य", mr: "मूल्य" },
} satisfies Record<string, Entry>;

export type TranslationKey = keyof typeof dictionary;

export function translate(locale: Locale, key: TranslationKey): string {
  return dictionary[key][locale] ?? dictionary[key].en;
}
