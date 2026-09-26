require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

# CocoaPods does not resolve an unpinned dependency on a prerelease version
# (e.g. `0.0.0-development` or `1.0.0-next.1`), so the pod version drops any
# prerelease suffix. The git tag keeps the full npm version.
pod_version = package["version"].sub(/[-+].*\z/, "")

Pod::Spec.new do |s|
  s.name         = "NitroPasskeys"
  s.version      = pod_version
  s.summary      = package["description"]
  s.homepage     = package["homepage"]
  s.license      = package["license"]
  s.authors      = package["author"]

  s.platforms    = { :ios => '16.0' }
  s.source       = { :git => "https://github.com/aparedes/react-native-nitro-passkeys.git", :tag => "#{package["version"]}" }

  s.source_files = [
    # Implementation (Swift)
    "ios/**/*.{swift}",
    # Autolinking/Registration (Objective-C++)
    "ios/**/*.{m,mm}",
  ]

  s.frameworks = 'AuthenticationServices'

  load 'nitrogen/generated/ios/NitroPasskeys+autolinking.rb'
  add_nitrogen_files(s)

  s.dependency 'React-jsi'
  s.dependency 'React-callinvoker'

  install_modules_dependencies(s)
end
