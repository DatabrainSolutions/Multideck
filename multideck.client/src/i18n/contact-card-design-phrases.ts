import type { LanguageCode } from "./languages"

/**
 * The contact-card design surface, in every supported language.
 *
 * Kept in its own file because the tab is almost entirely short choice labels —
 * a style name, a header shape, a code pattern — and those read badly when they
 * are scattered through the general dictionary. Layout names and their details
 * already live in the shared list and are not repeated here.
 */
export const contactCardDesignPhrases: Record<string, Partial<Record<LanguageCode, string>>> = {
  /* Sections */
  "Start from a look": { de: "Mit einem Look beginnen", fr: "Partir d’un style", ar: "ابدأ من مظهر جاهز" },
  "Each one is your card, drawn in your colour. Change anything underneath afterwards.": {
    de: "Jeder Look zeigt deine Karte in deiner Farbe. Alles darunter lässt sich danach anpassen.",
    fr: "Chaque option est votre carte, dans votre couleur. Tout le reste reste modifiable ensuite.",
    ar: "كل مظهر هو بطاقتك بلونك الخاص. يمكنك تعديل كل شيء أدناه بعد ذلك.",
  },
  "Style applied": { de: "Look übernommen", fr: "Style appliqué", ar: "تم تطبيق المظهر" },
  "Styling reset. Your logo and colour were kept.": {
    de: "Gestaltung zurückgesetzt. Logo und Farbe wurden beibehalten.",
    fr: "Mise en forme réinitialisée. Votre logo et votre couleur ont été conservés.",
    ar: "تمت إعادة ضبط التنسيق. تم الاحتفاظ بشعارك ولونك.",
  },
  "Arrangement": { de: "Anordnung", fr: "Disposition", ar: "الترتيب" },
  "Where the mark sits, how loud the heading is, how the fields are drawn.": {
    de: "Wo das Zeichen sitzt, wie laut die Überschrift ist und wie die Felder gezeichnet sind.",
    fr: "Où se place la marque, la force du titre et le dessin des champs.",
    ar: "موضع العلامة، وقوة العنوان، وطريقة رسم الحقول.",
  },
  "One accent carries the header, the marks and the buttons.": {
    de: "Eine Akzentfarbe trägt Kopfbereich, Zeichen und Schaltflächen.",
    fr: "Une seule couleur d’accent porte l’en-tête, les marques et les boutons.",
    ar: "لون تمييز واحد يحمل الرأس والعلامات والأزرار.",
  },
  "QR code": { de: "QR-Code", fr: "Code QR", ar: "رمز QR" },
  "Pick a look, then tune the pattern. Anything that would stop a camera reading it is corrected for you.": {
    de: "Wähle einen Look und passe dann das Muster an. Alles, was das Scannen verhindern würde, wird für dich korrigiert.",
    fr: "Choisissez un style puis affinez le motif. Tout ce qui empêcherait la lecture est corrigé pour vous.",
    ar: "اختر مظهرًا ثم اضبط النمط. سيتم تصحيح أي شيء يمنع الكاميرا من القراءة تلقائيًا.",
  },

  /* Controls */
  "Card style": { de: "Kartenlook", fr: "Style de carte", ar: "مظهر البطاقة" },
  "Header": { de: "Kopfbereich", fr: "En-tête", ar: "الرأس" },
  "The band shows your logo, or your company name when there is no logo yet.": {
    de: "Das Band zeigt dein Logo oder deinen Firmennamen, solange kein Logo hinterlegt ist.",
    fr: "Le bandeau affiche votre logo, ou le nom de votre entreprise en l’absence de logo.",
    ar: "يعرض الشريط شعارك، أو اسم شركتك في حال عدم وجود شعار.",
  },
  "Corners": { de: "Ecken", fr: "Angles", ar: "الزوايا" },
  "Soft": { de: "Weich", fr: "Arrondis", ar: "ناعمة" },
  "Sharp": { de: "Scharf", fr: "Nets", ar: "حادة" },
  "Theme": { de: "Erscheinungsbild", fr: "Thème", ar: "المظهر" },
  "Tinted washes the page in your accent instead of grey.": {
    de: "Getönt legt deine Akzentfarbe statt Grau über die Seite.",
    fr: "Teinté baigne la page dans votre couleur d’accent au lieu du gris.",
    ar: "يغمر الوضع الملوَّن الصفحة بلون التمييز بدلاً من الرمادي.",
  },
  "Light": { de: "Hell", fr: "Clair", ar: "فاتح" },
  "Dark": { de: "Dunkel", fr: "Sombre", ar: "غامق" },
  "Tinted": { de: "Getönt", fr: "Teinté", ar: "ملوَّن" },
  "Accent": { de: "Akzent", fr: "Accent", ar: "لون التمييز" },
  "From your logo": { de: "Aus deinem Logo", fr: "Depuis votre logo", ar: "من شعارك" },
  "Use this colour from your logo": { de: "Diese Farbe aus dem Logo verwenden", fr: "Utiliser cette couleur du logo", ar: "استخدم هذا اللون من شعارك" },
  "Look": { de: "Look", fr: "Style", ar: "المظهر" },
  "Code look": { de: "Code-Look", fr: "Style du code", ar: "مظهر الرمز" },
  "Pattern": { de: "Muster", fr: "Motif", ar: "النمط" },
  "Modules": { de: "Module", fr: "Modules", ar: "الوحدات" },
  "Corner eyes": { de: "Eckmarken", fr: "Repères d’angle", ar: "علامات الأركان" },
  "Colours": { de: "Farben", fr: "Couleurs", ar: "الألوان" },
  "Match my accent": { de: "An Akzentfarbe anpassen", fr: "Adapter à mon accent", ar: "مطابقة لون التمييز" },
  "Printing and reliability": { de: "Druck und Zuverlässigkeit", fr: "Impression et fiabilité", ar: "الطباعة والموثوقية" },
  "Show": { de: "Anzeigen", fr: "Afficher", ar: "إظهار" },
  "Hide": { de: "Ausblenden", fr: "Masquer", ar: "إخفاء" },
  "Reliability": { de: "Zuverlässigkeit", fr: "Fiabilité", ar: "الموثوقية" },
  "Maximum": { de: "Maximal", fr: "Maximale", ar: "أقصى" },
  "Logo size": { de: "Logogröße", fr: "Taille du logo", ar: "حجم الشعار" },
  "Quiet zone": { de: "Ruhezone", fr: "Marge blanche", ar: "الهامش الصامت" },
  "Tight": { de: "Eng", fr: "Serrée", ar: "ضيق" },
  "Generous": { de: "Großzügig", fr: "Large", ar: "واسع" },
  "Print at 30mm or larger and keep the light margin around the code.": {
    de: "Ab 30 mm drucken und den hellen Rand um den Code erhalten.",
    fr: "Imprimez à 30 mm minimum et conservez la marge claire autour du code.",
    ar: "اطبع بمقاس 30 مم أو أكبر وحافظ على الهامش الفاتح حول الرمز.",
  },
  "Open it in a new tab": { de: "In neuem Tab öffnen", fr: "Ouvrir dans un nouvel onglet", ar: "افتحه في تبويب جديد" },

  /* Style names */
  "Clean": { de: "Klar", fr: "Épuré", ar: "نظيف" },
  "Press": { de: "Presse", fr: "Presse", ar: "صحافي" },
  "Portrait": { de: "Porträt", fr: "Portrait", ar: "شخصي" },
  "Counter": { de: "Theke", fr: "Comptoir", ar: "منضدة" },
  "Midnight": { de: "Mitternacht", fr: "Minuit", ar: "منتصف الليل" },
  "The photo leads": { de: "Das Foto führt", fr: "La photo domine", ar: "الصورة في المقدمة" },
  "Everything above the fold": { de: "Alles auf einen Blick", fr: "Tout dès le premier écran", ar: "كل شيء في الشاشة الأولى" },
  "Page washed in your colour": { de: "Seite in deiner Farbe getönt", fr: "Page baignée dans votre couleur", ar: "صفحة مغمورة بلونك" },
  "Dark and quiet": { de: "Dunkel und ruhig", fr: "Sombre et discret", ar: "غامق وهادئ" },

  /* Header shapes */
  "None": { de: "Keiner", fr: "Aucun", ar: "بدون" },
  "Rule": { de: "Linie", fr: "Filet", ar: "خط" },
  "Band": { de: "Band", fr: "Bandeau", ar: "شريط" },
  "Cover": { de: "Fläche", fr: "Bandeau plein", ar: "غلاف" },
  "Straight into the page": { de: "Direkt in die Seite", fr: "Directement dans la page", ar: "مباشرة إلى الصفحة" },
  "A thin accent edge": { de: "Eine schmale Akzentkante", fr: "Un liseré d’accent", ar: "حافة رقيقة بلون التمييز" },
  "Logo on colour": { de: "Logo auf Farbe", fr: "Logo sur couleur", ar: "شعار على لون" },
  "A field to sit over": { de: "Eine Fläche zum Überlappen", fr: "Un fond que la marque chevauche", ar: "مساحة تتقدمها العلامة" },

  /* Code patterns and looks */
  "Square": { de: "Quadratisch", fr: "Carré", ar: "مربع" },
  "Rounded": { de: "Abgerundet", fr: "Arrondi", ar: "دائري الحواف" },
  "Dots": { de: "Punkte", fr: "Points", ar: "نقاط" },
  "Circle": { de: "Kreis", fr: "Cercle", ar: "دائرة" },
  "Dot": { de: "Punkt", fr: "Point", ar: "نقطة" },
  "Your colour": { de: "Deine Farbe", fr: "Votre couleur", ar: "لونك" },
  "Cream": { de: "Creme", fr: "Crème", ar: "كريمي" },
  "Slate": { de: "Schiefer", fr: "Ardoise", ar: "رمادي داكن" },

  /* Accent names */
  "Teal": { de: "Petrol", fr: "Sarcelle", ar: "أزرق مخضر" },
  "Ocean": { de: "Ozean", fr: "Océan", ar: "محيطي" },
  "Slate blue": { de: "Schieferblau", fr: "Bleu ardoise", ar: "أزرق رمادي" },
  "Violet": { de: "Violett", fr: "Violet", ar: "بنفسجي" },
  "Forest": { de: "Waldgrün", fr: "Forêt", ar: "أخضر داكن" },
  "Olive": { de: "Olive", fr: "Olive", ar: "زيتوني" },
  "Amber": { de: "Amber", fr: "Ambre", ar: "كهرماني" },
  "Clay": { de: "Ton", fr: "Argile", ar: "طيني" },
  "Brick": { de: "Ziegel", fr: "Brique", ar: "قرميدي" },
  "Plum": { de: "Pflaume", fr: "Prune", ar: "برقوقي" },
  "Graphite": { de: "Graphit", fr: "Graphite", ar: "غرافيت" },
  "Ink": { de: "Tinte", fr: "Encre", ar: "حبري" },
}
