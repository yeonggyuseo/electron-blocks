// afterPack: 서명 identity가 없을 때 mac 앱을 ad-hoc 서명한다.
// Electron arm64 바이너리는 링커가 자동 ad-hoc 서명하지만 x64는 무서명으로 남아
// 인텔맥 Gatekeeper가 "손상된 앱"으로 차단하므로, x64도 동일하게 맞춘다.
const { execSync } = require('child_process')
const path = require('path')

exports.default = async function adhocSign(context) {
  if (context.electronPlatformName !== 'darwin') return

  const appName = `${context.packager.appInfo.productFilename}.app`
  const appPath = path.join(context.appOutDir, appName)

  execSync(`codesign --force --deep --sign - "${appPath}"`, {
    stdio: 'inherit',
  })
  execSync(`codesign --verify --deep --strict "${appPath}"`, {
    stdio: 'inherit',
  })
}
