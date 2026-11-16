export type Lang = 'en' | 'si';

export interface CopyBundle {
  brand: string;
  navIdentity: string;
  navSource: string;
  navSigning: string;
  navGuide: string;
  navBuildCta: string;
  heroTitle: string;
  heroSubtitle: string;
  downloadSingleHtml: string;
  copyHtmlCode: string;
  viewHtmlCode: string;
  copiedHtml: string;
  htmlModalTitle: string;
  htmlModalDesc: string;
  selectAllCopy: string;
  closeBtn: string;
  resetBtn: string;
  step1Title: string;
  appNameLabel: string;
  packageIdLabel: string;
  packageIdAuto: string;
  versionNameLabel: string;
  versionCodeLabel: string;
  targetSdkLabel: string;
  iconStudioTitle: string;
  iconUploadBtn: string;
  iconAutoBtn: string;
  iconGlyphLabel: string;
  iconPaletteLabel: string;
  iconBgNote: string;
  step2Title: string;
  tabCode: string;
  tabFiles: string;
  tabUrl: string;
  codeLabel: string;
  codePlaceholder: string;
  presetsLabel: string;
  presetGallery: string;
  presetNotes: string;
  presetLavender: string;
  presetCalc: string;
  dropHint: string;
  selectFilesBtn: string;
  filesNote: string;
  clearFilesBtn: string;
  urlLabel: string;
  urlPlaceholder: string;
  urlNote: string;
  step3Title: string;
  fullscreenTitle: string;
  fullscreenDesc: string;
  signingModeLabel: string;
  signingDefault: string;
  signingPersonal: string;
  signingNewKeyBtn: string;
  signingExportBtn: string;
  signingHint: string;
  previewTitle: string;
  previewTabApp: string;
  previewTabLauncher: string;
  buildBtn: string;
  buildingBtn: string;
  downloadBtn: string;
  readyTitle: string;
  guideTitle: string;
  guidePoints: string[];
}

export const COPY: Record<Lang, CopyBundle> = {
  en: {
    brand: 'HTML to APK Studio',
    navIdentity: 'Identity',
    navSource: 'Source',
    navSigning: 'Signing',
    navGuide: 'Install Guide',
    navBuildCta: 'Build APK',
    heroTitle: 'Package HTML, ZIP projects, or web links into installable Android APKs',
    heroSubtitle:
      'Builds 4-byte zipaligned packages dual-signed with v1 JAR and APK Signature Scheme v2 so Android phones install cleanly without parse errors.',
    downloadSingleHtml: 'Download Single HTML',
    copyHtmlCode: 'Copy HTML Code',
    viewHtmlCode: 'View HTML Code',
    copiedHtml: 'Copied!',
    htmlModalTitle: 'Combined Single-File HTML (All 12 Files)',
    htmlModalDesc:
      'All 12 app files (index.html, CSS, React UI, APK Builder, Manifest Patcher, Zipalign/Signers, Icon Studio, Phone Preview, and libraries) are bundled into this single standalone HTML file.',
    selectAllCopy: 'Copy Full HTML',
    closeBtn: 'Close',
    resetBtn: 'Reset',
    step1Title: '01. App Identity & Launcher Icon',
    appNameLabel: 'App Name',
    packageIdLabel: 'Package ID',
    packageIdAuto: 'Auto',
    versionNameLabel: 'Version Name',
    versionCodeLabel: 'Version Code',
    targetSdkLabel: 'Target Android SDK',
    iconStudioTitle: 'Launcher Icon (192×192 PNG)',
    iconUploadBtn: 'Upload Image',
    iconAutoBtn: 'Generated Icon',
    iconGlyphLabel: 'Badge Text / Emoji',
    iconPaletteLabel: 'Background Style',
    iconBgNote: 'Select PNG, JPG, WebP, or SVG. Transparent images receive a clean backdrop.',
    step2Title: '02. App Content Source',
    tabCode: 'HTML Code',
    tabFiles: 'Files / ZIP',
    tabUrl: 'Website URL',
    codeLabel: 'HTML Document',
    codePlaceholder: '<!DOCTYPE html>\n<html>\n  <head>...</head>\n  <body>...</body>\n</html>',
    presetsLabel: 'Load preset:',
    presetGallery: 'Image Picker Demo',
    presetNotes: 'Offline Notes',
    presetLavender: 'Lavender Gallery',
    presetCalc: '3D Calculator',
    dropHint: 'Drop HTML, CSS, JS, images, or a .zip archive here',
    selectFilesBtn: 'Choose Files or ZIP',
    filesNote: 'Include index.html at root or inside a folder in your ZIP archive.',
    clearFilesBtn: 'Clear all',
    urlLabel: 'Website URL',
    urlPlaceholder: 'https://example.com',
    urlNote: 'Opens inside the Android WebView with offline detection and retry support.',
    step3Title: '03. Display & Signing Configuration',
    fullscreenTitle: 'Immersive Fullscreen Mode',
    fullscreenDesc:
      'Off shows transparent status and navigation bars. On hides system bars until swiped from the edge.',
    signingModeLabel: 'APK Signing Key',
    signingDefault: 'Studio Default Key (2020–2055)',
    signingPersonal: 'Personal Keypair',
    signingNewKeyBtn: 'Generate Personal Key',
    signingExportBtn: 'Download PEM Backup',
    signingHint:
      'Using the same signing key and Package ID lets new APK builds update an already-installed app cleanly.',
    previewTitle: 'Device Preview',
    previewTabApp: 'App Screen',
    previewTabLauncher: 'Home Icon',
    buildBtn: 'Build Signed APK',
    buildingBtn: 'Aligning & Signing APK...',
    downloadBtn: 'Download APK',
    readyTitle: 'APK Ready for Phone Install',
    guideTitle: 'Phone Installation Checklist',
    guidePoints: [
      'Enable "Install unknown apps" for your browser or file manager in Android Settings when prompted.',
      'If Google Play Protect shows "App scan recommended", tap "More details" then "Install without scanning" / "Install anyway" (normal for self-signed APKs outside Play Store).',
      'If you previously tried installing a broken APK with the same Package ID, uninstall the old one first before installing this v2-signed build.',
      'In-app file and gallery pickers (<input type="file">) work natively inside the generated app.',
    ],
  },
  si: {
    brand: 'HTML to APK Studio',
    navIdentity: 'App Name',
    navSource: 'Code / Files',
    navSigning: 'Signing',
    navGuide: 'Install Guide',
    navBuildCta: 'APK Hadanna',
    heroTitle: 'HTML, ZIP files ho Website link ekak phone eke install wena APK ekak karanna',
    heroSubtitle:
      '4-byte Zipalign saha APK Signature Scheme v2 + v1 dual-sign ekka hadana nisa niyama widihata Android phone walata install wenawa.',
    downloadSingleHtml: 'Single HTML Ganna',
    copyHtmlCode: 'HTML Code Copy',
    viewHtmlCode: 'HTML Code Balanna',
    copiedHtml: 'Copy Una!',
    htmlModalTitle: 'Okkoma Files 12 Ma Ekathu Karapu Single HTML Code Eka',
    htmlModalDesc:
      'App eke okkoma code files 12 ma (index.html, CSS, UI, APK Builder, Manifest Patcher, Zipalign/Signer, Icon Studio, Preview saha libraries) thani HTML file ekakata ekathu karala thiyenne.',
    selectAllCopy: 'Sumpurna HTML Copy',
    closeBtn: 'Close',
    resetBtn: 'Reset',
    step1Title: '01. App Name, Package saha DP Icon',
    appNameLabel: 'App Name eka',
    packageIdLabel: 'Package ID',
    packageIdAuto: 'Auto',
    versionNameLabel: 'Version',
    versionCodeLabel: 'Build Code',
    targetSdkLabel: 'Target Android SDK',
    iconStudioTitle: 'App DP Icon eka (192×192 PNG)',
    iconUploadBtn: 'DP Image Select',
    iconAutoBtn: 'Auto DP Hadanna',
    iconGlyphLabel: 'Icon Akura / Emoji',
    iconPaletteLabel: 'Icon Color',
    iconBgNote: 'PNG, JPG, WebP ho SVG select karanna (HEIC wage format wada naha).',
    step2Title: '02. App eka mokakda?',
    tabCode: 'HTML Code',
    tabFiles: 'Files / ZIP',
    tabUrl: 'Website Link',
    codeLabel: 'HTML Code eka paste karanna',
    codePlaceholder: '<!DOCTYPE html>\n<html>\n  <head>...</head>\n  <body>...</body>\n</html>',
    presetsLabel: 'Sample ekak ganna:',
    presetGallery: 'Image Gallery',
    presetNotes: 'Notes App',
    presetLavender: 'Lavender Gallery',
    presetCalc: '3D Calculator',
    dropHint: 'HTML, CSS, JS, images ho .zip file mekata adala danna',
    selectFilesBtn: 'Files / ZIP Select Karanna',
    filesNote: 'ZIP ekak nam index.html file eka athule thiyenna one.',
    clearFilesBtn: 'Clear',
    urlLabel: 'Website Link eka',
    urlPlaceholder: 'https://example.com',
    urlNote: 'App eka open karaddi me website eka app eka athule open wenawa (Internet one).',
    step3Title: '03. Screen saha Signing Settings',
    fullscreenTitle: 'Immersive Full Screen (Optional)',
    fullscreenDesc:
      'Off thibboth udata time/battery saha yata buttons penenawa (transparent). On karoth bars hide wenawa.',
    signingModeLabel: 'APK Signing Key',
    signingDefault: 'Studio Default Key (Updates Wada)',
    signingPersonal: 'Personal Keypair',
    signingNewKeyBtn: 'Aluth Key Ekak Hadanna',
    signingExportBtn: 'Key Backup Ganna',
    signingHint:
      'Same Package ID saha same key eken ayeth hadala install kalama parana app eka update wenawa.',
    previewTitle: 'Phone Preview',
    previewTabApp: 'App Screen',
    previewTabLauncher: 'Home Icon',
    buildBtn: 'APK eka Hadanna',
    buildingBtn: 'Zipalign & Sign wenawa...',
    downloadBtn: 'APK eka Download Karanna',
    readyTitle: 'APK eka Hadala Iwarai',
    guideTitle: 'Phone eke Install Karana Widiha',
    guidePoints: [
      'Phone eke "Install unknown apps" permission eka allow karanna.',
      'Play Protect "App scan recommended" kiyala awoth "More details" ho "Install without scanning" kiyana podi text eka click karanna.',
      'Kalın hadapu install nowunu / wena key ekaka app ekak thibboth eka uninstall karala me aluth APK eka install karanna.',
      'App eka athule photo / file select karana (<input type="file">) eka niyameta wada karanawa.',
    ],
  },
};
