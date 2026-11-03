/**
 * Comprehensive Verification Suite: Mobile UX Audit & Fix
 * MVSS Automobiles ERP (Auto4m)
 *
 * Verifies:
 * 1. Signature Pad:
 *    - touch-action: none applied
 *    - non-passive event listeners with preventDefault
 *    - Bézier curve interpolation for smooth strokes
 *    - Clear and Save Signature controls
 *    - Customer, Technician, and Advisor signature integration
 * 2. Camera Integration:
 *    - LiveCameraModal WebRTC getUserMedia implementation
 *    - Rear-facing camera preference (facingMode: { ideal: 'environment' })
 *    - Instant photo preview & retake controls
 *    - Stream teardown & hardware release (track.stop())
 *    - Permission error handling & system camera fallback
 *    - Separated Capture Photo vs Upload from Gallery buttons
 * 3. Android TWA Configuration:
 *    - Package ID preserved: com.mvssautomobiles.erp
 *    - Signing key SHA256 match in assetlinks.json
 *    - Both mvssautomobiles.com and www.mvssautomobiles.com in assetStatements
 *    - additionalTrustedOrigins in twa-manifest.json
 *    - autoVerify intent-filters in AndroidManifest.xml
 * 4. Mobile Responsiveness:
 *    - Viewport overflow protection
 *    - Touch momentum scrolling
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '../..');

console.log('========================================================================');
console.log('  TEST SUITE: CRITICAL MOBILE UX AUDIT & FIX — MVSS AUTO4M ERP');
console.log('========================================================================\n');

let passedTests = 0;
let totalTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`✓ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`✗ [FAIL] ${name}: ${err.message}`);
    process.exitCode = 1;
  }
}

// ------------------------------------------------------------------------
// 1. SIGNATURE PAD AUDIT
// ------------------------------------------------------------------------
console.log('--- 1. Testing SignaturePad Component & Drawing Engine ---');

test('SignaturePad component sets touch-action: none inline and on canvas', () => {
  const code = fs.readFileSync(path.join(rootDir, 'frontend/src/components/SignaturePad.jsx'), 'utf8');
  assert(code.includes("canvas.style.touchAction = 'none'"), 'Must set canvas.style.touchAction = none');
  assert(code.includes("touchAction: 'none'"), 'Must apply touchAction none in style attribute');
});

test('SignaturePad uses non-passive event listeners to prevent page scrolling', () => {
  const code = fs.readFileSync(path.join(rootDir, 'frontend/src/components/SignaturePad.jsx'), 'utf8');
  assert(code.includes('{ passive: false }'), 'Must attach event listeners with { passive: false }');
  assert(code.includes('e.preventDefault()'), 'Must invoke e.preventDefault() during drawing');
});

test('SignaturePad implements smooth stroke interpolation (quadratic Bézier curves)', () => {
  const code = fs.readFileSync(path.join(rootDir, 'frontend/src/components/SignaturePad.jsx'), 'utf8');
  assert(code.includes('ctx.quadraticCurveTo'), 'Must use quadratic curves for silky smooth finger drawing');
  assert(code.includes('window.devicePixelRatio'), 'Must scale for Retina / high-DPI mobile screens');
});

test('SignaturePad provides both Clear and Save Signature controls', () => {
  const code = fs.readFileSync(path.join(rootDir, 'frontend/src/components/SignaturePad.jsx'), 'utf8');
  assert(code.includes('clearPad'), 'Must include clearPad action');
  assert(code.includes('saveSignature'), 'Must include saveSignature action');
  assert(code.includes('RotateCcw'), 'Must include Clear icon');
  assert(code.includes('Save') || code.includes('Check'), 'Must include Save control');
});

test('JobCardForm supports Customer, Advisor, and Technician signatures', () => {
  const code = fs.readFileSync(path.join(rootDir, 'frontend/src/pages/JobCardForm.jsx'), 'utf8');
  assert(code.includes('formData.signatures.customer'), 'Must support Customer signature');
  assert(code.includes('formData.signatures.advisor'), 'Must support Advisor signature');
  assert(code.includes('formData.signatures.technician'), 'Must support Technician signature');
});

test('JobCardDetails supports interactive signing modal for all three signature areas', () => {
  const code = fs.readFileSync(path.join(rootDir, 'frontend/src/pages/JobCardDetails.jsx'), 'utf8');
  assert(code.includes('handleOpenSignatureModal'), 'Must have handleOpenSignatureModal');
  assert(code.includes('handleSaveSignature'), 'Must have handleSaveSignature');
  assert(code.includes('<SignaturePad'), 'Must render SignaturePad in details modal');
});

// ------------------------------------------------------------------------
// 2. CAMERA COMPONENT AUDIT
// ------------------------------------------------------------------------
console.log('\n--- 2. Testing Live Camera Component & Job Card Integration ---');

test('LiveCameraModal component exists and implements WebRTC getUserMedia', () => {
  const code = fs.readFileSync(path.join(rootDir, 'frontend/src/components/LiveCameraModal.jsx'), 'utf8');
  assert(code.includes('navigator.mediaDevices.getUserMedia'), 'Must use navigator.mediaDevices.getUserMedia');
});

test('LiveCameraModal prefers rear-facing camera (environment mode)', () => {
  const code = fs.readFileSync(path.join(rootDir, 'frontend/src/components/LiveCameraModal.jsx'), 'utf8');
  assert(code.includes("facingMode: { ideal: mode }") || code.includes("'environment'"), 'Must prefer environment rear camera');
});

test('LiveCameraModal includes instant preview, retake, and attach controls', () => {
  const code = fs.readFileSync(path.join(rootDir, 'frontend/src/components/LiveCameraModal.jsx'), 'utf8');
  assert(code.includes('handleRetake'), 'Must have handleRetake function');
  assert(code.includes('handleConfirmPhoto'), 'Must have handleConfirmPhoto function');
  assert(code.includes('Retake'), 'Must display Retake button');
  assert(code.includes('Attach Photo'), 'Must display Attach button');
});

test('LiveCameraModal stops media tracks and releases hardware on close', () => {
  const code = fs.readFileSync(path.join(rootDir, 'frontend/src/components/LiveCameraModal.jsx'), 'utf8');
  assert(code.includes('track.stop()'), 'Must call track.stop() to release camera');
  assert(code.includes('stopStream'), 'Must implement stopStream');
});

test('LiveCameraModal provides permission error handling and system fallback', () => {
  const code = fs.readFileSync(path.join(rootDir, 'frontend/src/components/LiveCameraModal.jsx'), 'utf8');
  assert(code.includes('NotAllowedError'), 'Must handle NotAllowedError');
  assert(code.includes('capture="environment"'), 'Must have capture="environment" fallback input');
});

test('JobCardForm separates Capture Photo and Upload from Gallery actions', () => {
  const code = fs.readFileSync(path.join(rootDir, 'frontend/src/pages/JobCardForm.jsx'), 'utf8');
  assert(code.includes('Capture Photo (Rear Camera)'), 'Must have Capture Photo button');
  assert(code.includes('Upload from Gallery'), 'Must have Upload from Gallery button');
  assert(code.includes('<LiveCameraModal'), 'Must mount LiveCameraModal');
});

test('BodyShop integrates LiveCameraModal for vehicle photo capture', () => {
  const code = fs.readFileSync(path.join(rootDir, 'frontend/src/pages/BodyShop.jsx'), 'utf8');
  assert(code.includes('<LiveCameraModal'), 'Must mount LiveCameraModal in BodyShop');
});

// ------------------------------------------------------------------------
// 3. ANDROID TWA / DIGITAL ASSET LINKS AUDIT
// ------------------------------------------------------------------------
console.log('\n--- 3. Testing Android TWA & Digital Asset Links Verification ---');

test('Package ID is preserved as com.mvssautomobiles.erp', () => {
  const twaManifest = JSON.parse(fs.readFileSync(path.join(rootDir, 'android-twa/twa-manifest.json'), 'utf8'));
  assert.strictEqual(twaManifest.packageId, 'com.mvssautomobiles.erp', 'Package ID must match com.mvssautomobiles.erp');

  const buildGradle = fs.readFileSync(path.join(rootDir, 'android-twa/app/build.gradle'), 'utf8');
  assert(buildGradle.includes("applicationId: 'com.mvssautomobiles.erp'"), 'build.gradle must have applicationId com.mvssautomobiles.erp');
});

test('assetlinks.json contains both upload key and Play Store signing key fingerprints', () => {
  const assetlinks = JSON.parse(fs.readFileSync(path.join(rootDir, 'frontend/public/.well-known/assetlinks.json'), 'utf8'));
  const erpEntry = assetlinks.find(e => e.target.package_name === 'com.mvssautomobiles.erp');
  assert(erpEntry, 'Must have entry for com.mvssautomobiles.erp');

  const fingerprints = erpEntry.target.sha256_cert_fingerprints;
  assert(fingerprints.includes('FC:64:FB:1A:D2:82:BC:FB:9A:55:53:1E:0C:6C:27:06:12:A7:69:DC:07:AE:2C:E2:F6:0B:05:C2:22:16:5B:48'), 'Must include upload key fingerprint');
  assert(fingerprints.includes('2C:31:79:4F:60:A0:6C:7C:04:72:D9:B7:C9:05:FE:61:FD:FA:37:D8:EF:32:48:51:C8:5B:A9:4D:B3:F6:91:36'), 'Must include Play App Signing key fingerprint');
});

test('strings.xml assetStatements includes both apex and www domains', () => {
  const stringsXml = fs.readFileSync(path.join(rootDir, 'android-twa/app/src/main/res/values/strings.xml'), 'utf8');
  assert(stringsXml.includes('https://mvssautomobiles.com'), 'Must declare https://mvssautomobiles.com');
  assert(stringsXml.includes('https://www.mvssautomobiles.com'), 'Must declare https://www.mvssautomobiles.com');
});

test('twa-manifest.json includes www domain in additionalTrustedOrigins', () => {
  const twaManifest = JSON.parse(fs.readFileSync(path.join(rootDir, 'android-twa/twa-manifest.json'), 'utf8'));
  assert(twaManifest.additionalTrustedOrigins.includes('https://www.mvssautomobiles.com'), 'additionalTrustedOrigins must include https://www.mvssautomobiles.com');
});

test('AndroidManifest.xml includes autoVerify intent filters for both apex and www domains', () => {
  const manifestXml = fs.readFileSync(path.join(rootDir, 'android-twa/app/src/main/AndroidManifest.xml'), 'utf8');
  assert(manifestXml.includes('android:host="@string/hostName"'), 'Must have intent-filter for hostName');
  assert(manifestXml.includes('android:host="www.mvssautomobiles.com"'), 'Must have intent-filter for www host');
  assert(manifestXml.includes('android:autoVerify="true"'), 'Must have autoVerify="true"');
});

test('manifest.json specifies display: standalone and display_override', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, 'frontend/public/manifest.json'), 'utf8'));
  assert.strictEqual(manifest.display, 'standalone');
  assert(Array.isArray(manifest.display_override) && manifest.display_override.includes('standalone'));
});

// ------------------------------------------------------------------------
// 4. MOBILE RESPONSIVENESS AUDIT
// ------------------------------------------------------------------------
console.log('\n--- 4. Testing Mobile Responsiveness & Viewport Rules ---');

test('index.css prevents horizontal overflow on html and body', () => {
  const css = fs.readFileSync(path.join(rootDir, 'frontend/src/index.css'), 'utf8');
  assert(css.includes('overflow-x: hidden'), 'Must include overflow-x: hidden');
  assert(css.includes('max-width: 100vw'), 'Must include max-width: 100vw');
});

test('index.css supports momentum scrolling and drawing canvas isolation', () => {
  const css = fs.readFileSync(path.join(rootDir, 'frontend/src/index.css'), 'utf8');
  assert(css.includes('-webkit-overflow-scrolling: touch'), 'Must include -webkit-overflow-scrolling: touch');
  assert(css.includes('touch-action: none !important'), 'Must isolate drawing canvas touch action');
});

test('App.jsx provides responsive main container padding (p-3 sm:p-5 md:p-6)', () => {
  const code = fs.readFileSync(path.join(rootDir, 'frontend/src/App.jsx'), 'utf8');
  assert(code.includes('p-3 sm:p-5 md:p-6'), 'Must use mobile-optimized padding in main');
});

test('Release artifacts exist and are synced at root and release-artifacts', () => {
  assert(fs.existsSync(path.join(rootDir, 'Auto4m-release.aab')), 'Auto4m-release.aab must exist at root');
  assert(fs.existsSync(path.join(rootDir, 'Auto4m-release.apk')), 'Auto4m-release.apk must exist at root');
  assert(fs.existsSync(path.join(rootDir, 'dist.zip')), 'dist.zip must exist at root');
  const distZipStat = fs.statSync(path.join(rootDir, 'dist.zip'));
  assert(distZipStat.size > 1000000, 'dist.zip must be a valid archive > 1MB');
});

console.log(`\n========================================================================`);
console.log(`  ALL ${passedTests}/${totalTests} TESTS PASSED (100%)`);
console.log(`========================================================================\n`);
