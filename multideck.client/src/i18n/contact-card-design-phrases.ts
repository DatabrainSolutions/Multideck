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
  "Each one is your card, in your colour and your words. Change anything underneath afterwards.": {
    de: "Jeder Look zeigt deine Karte in deiner Farbe und mit deinem Text. Alles darunter lässt sich danach anpassen.",
    fr: "Chaque option est votre carte, dans votre couleur et avec vos mots. Tout le reste reste modifiable ensuite.",
    ar: "كل مظهر هو بطاقتك بلونك الخاص وبكلماتك. يمكنك تعديل كل شيء أدناه بعد ذلك.",
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
  "Brand": { de: "Marke", fr: "Marque", ar: "الهوية" },
  "Your logo, one accent colour, and how the page is lit.": {
    de: "Dein Logo, eine Akzentfarbe und die Helligkeit der Seite.",
    fr: "Votre logo, une couleur d’accent et la luminosité de la page.",
    ar: "شعارك، ولون تمييز واحد، وإضاءة الصفحة.",
  },
  "It carries the header, the marks and the buttons.": {
    de: "Sie trägt Kopfbereich, Zeichen und Schaltflächen.",
    fr: "Elle porte l’en-tête, les marques et les boutons.",
    ar: "يحمل الرأس والعلامات والأزرار.",
  },
  "Applies to the fields, the buttons and any panel they sit on.": {
    de: "Gilt für Felder, Schaltflächen und jede Fläche, auf der sie liegen.",
    fr: "S’applique aux champs, aux boutons et à tout panneau qui les porte.",
    ar: "ينطبق على الحقول والأزرار وأي لوحة تحتويها.",
  },
  "QR code": { de: "QR-Code", fr: "Code QR", ar: "رمز QR" },
  "Pattern and colour together, as a camera sees them. Anything that would stop a scan is corrected for you.": {
    de: "Muster und Farbe zusammen, so wie eine Kamera sie sieht. Alles, was einen Scan verhindern würde, wird für dich korrigiert.",
    fr: "Le motif et la couleur ensemble, tels qu’une caméra les voit. Tout ce qui empêcherait la lecture est corrigé pour vous.",
    ar: "النمط واللون معًا، كما تراهما الكاميرا. يتم تصحيح أي شيء يمنع المسح تلقائيًا.",
  },
  "The cells and the three corner markers a scanner locks on to.": {
    de: "Die Zellen und die drei Eckmarken, an denen sich ein Scanner ausrichtet.",
    fr: "Les cellules et les trois repères d’angle sur lesquels un scanner se cale.",
    ar: "الخلايا وعلامات الأركان الثلاث التي يعتمد عليها الماسح.",
  },
  "Colour and logo": { de: "Farbe und Logo", fr: "Couleur et logo", ar: "اللون والشعار" },
  "Your code": { de: "Dein Code", fr: "Votre code", ar: "رمزك" },
  "The cells": { de: "Die Zellen", fr: "Les cellules", ar: "الخلايا" },
  "The plate behind them": { de: "Die Fläche dahinter", fr: "Le fond derrière elles", ar: "الخلفية وراءها" },
  "No logo yet": { de: "Noch kein Logo", fr: "Pas encore de logo", ar: "لا يوجد شعار بعد" },
  "Add a logo on the Design tab to use it here.": {
    de: "Lade im Tab „Design“ ein Logo hoch, um es hier zu verwenden.",
    fr: "Ajoutez un logo dans l’onglet Design pour l’utiliser ici.",
    ar: "أضف شعارًا من تبويب التصميم لاستخدامه هنا.",
  },
  "Code reset to the standard look.": {
    de: "Code auf den Standardlook zurückgesetzt.",
    fr: "Code réinitialisé au style standard.",
    ar: "تمت إعادة الرمز إلى المظهر القياسي.",
  },

  /* Controls */
  "Card style": { de: "Kartenlook", fr: "Style de carte", ar: "مظهر البطاقة" },
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
  "Open it in a new tab": { de: "In neuem Tab öffnen", fr: "Ouvrir dans un nouvel onglet", ar: "افتحه في تبويب جديد" },

  /* Logo */
  "Logo": { de: "Logo", fr: "Logo", ar: "الشعار" },
  "Shown on the public page, and optionally in the middle of the code.": {
    de: "Erscheint auf der öffentlichen Seite und optional in der Mitte des Codes.",
    fr: "Affiché sur la page publique, et éventuellement au centre du code.",
    ar: "يظهر على الصفحة العامة، وفي منتصف الرمز إن أردت.",
  },
  "Logo added": { de: "Logo hinzugefügt", fr: "Logo ajouté", ar: "تم إضافة الشعار" },
  "Current logo": { de: "Aktuelles Logo", fr: "Logo actuel", ar: "الشعار الحالي" },
  "Remove logo": { de: "Logo entfernen", fr: "Supprimer le logo", ar: "إزالة الشعار" },
  "Replace": { de: "Ersetzen", fr: "Remplacer", ar: "استبدال" },
  "Drop an image here, or choose a file.": {
    de: "Bild hierher ziehen oder eine Datei auswählen.",
    fr: "Déposez une image ici, ou choisissez un fichier.",
    ar: "أفلِت صورة هنا، أو اختر ملفًا.",
  },
  "PNG or SVG with a transparent background works best. Up to": {
    de: "PNG oder SVG mit transparentem Hintergrund funktioniert am besten. Bis zu",
    fr: "Un PNG ou SVG à fond transparent fonctionne mieux. Jusqu’à",
    ar: "يفضّل PNG أو SVG بخلفية شفافة. حتى",
  },
  "Logo changed. Saving…": { de: "Logo geändert. Wird gespeichert …", fr: "Logo modifié. Enregistrement…", ar: "تم تغيير الشعار. جارٍ الحفظ…" },
  "Choose an image file.": { de: "Wähle eine Bilddatei.", fr: "Choisissez un fichier image.", ar: "اختر ملف صورة." },
  "That image could not be read.": { de: "Dieses Bild konnte nicht gelesen werden.", fr: "Cette image n’a pas pu être lue.", ar: "تعذر قراءة هذه الصورة." },
  "That image is over": { de: "Dieses Bild ist größer als", fr: "Cette image dépasse", ar: "حجم هذه الصورة يتجاوز" },
  "Logo in the code": { de: "Logo im Code", fr: "Logo dans le code", ar: "الشعار داخل الرمز" },
  "Clears a square in the centre and raises error correction so the code still scans.": {
    de: "Legt ein Quadrat in der Mitte frei und erhöht die Fehlerkorrektur, damit der Code weiter scannbar bleibt.",
    fr: "Dégage un carré au centre et augmente la correction d’erreur pour que le code reste lisible.",
    ar: "يفرّغ مربعًا في المنتصف ويرفع تصحيح الأخطاء ليبقى الرمز قابلاً للمسح.",
  },

  /* Code colour and reliability */
  "Code colour": { de: "Codefarbe", fr: "Couleur du code", ar: "لون الرمز" },
  "Code background": { de: "Codehintergrund", fr: "Fond du code", ar: "خلفية الرمز" },
  "Keep the code dark on light. Inverting it stops many scanners working.": {
    de: "Halte den Code dunkel auf hell. Umgekehrt versagen viele Scanner.",
    fr: "Gardez le code sombre sur clair. L’inverser empêche de nombreux scanners de fonctionner.",
    ar: "أبقِ الرمز غامقًا على فاتح. عكسه يمنع كثيرًا من الماسحات من العمل.",
  },
  "These colours are too close for reliable scanning. The preview and downloads will use a safe black-and-white code until contrast improves.": {
    de: "Diese Farben liegen für ein zuverlässiges Scannen zu nah beieinander. Vorschau und Downloads verwenden einen sicheren Schwarz-Weiß-Code, bis der Kontrast stimmt.",
    fr: "Ces couleurs sont trop proches pour une lecture fiable. L’aperçu et les téléchargements utiliseront un code noir et blanc sûr jusqu’à ce que le contraste s’améliore.",
    ar: "هذان اللونان متقاربان جدًا لمسح موثوق. ستستخدم المعاينة والتنزيلات رمزًا أبيض وأسود آمنًا حتى يتحسن التباين.",
  },
  "This colour is too close to the page behind it, so buttons would lose their edge. They will use a readable fallback instead.": {
    de: "Diese Farbe liegt zu nah an der Seite dahinter, sodass Schaltflächen ihre Kante verlieren würden. Sie verwenden stattdessen eine lesbare Ersatzfarbe.",
    fr: "Cette couleur est trop proche de la page derrière elle : les boutons perdraient leur contour. Ils utiliseront une couleur de repli lisible.",
    ar: "هذا اللون قريب جدًا من الصفحة خلفه، فتفقد الأزرار حدودها. ستستخدم لونًا بديلاً واضحًا.",
  },
  "Higher levels help when the code is printed small or has a logo.": {
    de: "Höhere Stufen helfen, wenn der Code klein gedruckt wird oder ein Logo trägt.",
    fr: "Les niveaux élevés aident quand le code est imprimé petit ou porte un logo.",
    ar: "تفيد المستويات الأعلى عند طباعة الرمز بحجم صغير أو عند احتوائه على شعار.",
  },
  "Logo mode uses Maximum automatically to protect scanning.": {
    de: "Im Logomodus wird automatisch „Maximal“ verwendet, um das Scannen zu schützen.",
    fr: "Le mode logo passe automatiquement au niveau maximal pour préserver la lecture.",
    ar: "يستخدم وضع الشعار المستوى الأقصى تلقائيًا لحماية المسح.",
  },
  "The clear edge helps cameras recognise the code on busy backgrounds.": {
    de: "Der freie Rand hilft Kameras, den Code auf unruhigem Hintergrund zu erkennen.",
    fr: "La marge claire aide les caméras à reconnaître le code sur un fond chargé.",
    ar: "يساعد الهامش الفاتح الكاميرات على تمييز الرمز على خلفيات مزدحمة.",
  },
  "Error correction": { de: "Fehlerkorrektur", fr: "Correction d’erreur", ar: "تصحيح الأخطاء" },
  "Module style": { de: "Modulstil", fr: "Style des modules", ar: "نمط الوحدات" },
  "Eye style": { de: "Eckmarkenstil", fr: "Style des repères", ar: "نمط علامات الأركان" },
  "QR code for": { de: "QR-Code für", fr: "Code QR pour", ar: "رمز QR لـ" },
  "Print at 30mm or larger and keep the light margin around the code. A cropped code will not scan.": {
    de: "Ab 30 mm drucken und den hellen Rand um den Code erhalten. Ein beschnittener Code lässt sich nicht scannen.",
    fr: "Imprimez à 30 mm minimum et conservez la marge claire autour du code. Un code recadré ne se lit pas.",
    ar: "اطبع بمقاس 30 مم أو أكبر وحافظ على الهامش الفاتح حول الرمز. الرمز المقطوع لا يُمسح.",
  },

  /* Preview */
  "Preview screen": { de: "Vorschauansicht", fr: "Écran d’aperçu", ar: "شاشة المعاينة" },
  "Form": { de: "Formular", fr: "Formulaire", ar: "النموذج" },
  "Exchange": { de: "Austausch", fr: "Échange", ar: "التبادل" },
  "Text contrast": { de: "Textkontrast", fr: "Contraste du texte", ar: "تباين النص" },

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
