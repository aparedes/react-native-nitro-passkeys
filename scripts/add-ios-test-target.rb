#!/usr/bin/env ruby
# frozen_string_literal: true

# Adds the `NitroPasskeysExampleTests` XCTest bundle to the example app's Xcode project and to the
# shared scheme's Test action. Edits go through the `xcodeproj` gem (ships with CocoaPods) rather
# than by hand. Idempotent: exits 0 without changes when the target already exists.
#
# Usage: ruby scripts/add-ios-test-target.rb
# Then:  bun run --cwd example pod

require 'xcodeproj'

ROOT = File.expand_path('..', __dir__)
IOS_DIR = File.join(ROOT, 'example', 'ios')
PROJECT_PATH = File.join(IOS_DIR, 'NitroPasskeysExample.xcodeproj')
APP_NAME = 'NitroPasskeysExample'
TEST_NAME = 'NitroPasskeysExampleTests'
DEPLOYMENT_TARGET = '16.0'

project = Xcodeproj::Project.open(PROJECT_PATH)

if project.targets.any? { |t| t.name == TEST_NAME }
  puts "#{TEST_NAME} already exists in #{File.basename(PROJECT_PATH)}; nothing to do."
  exit 0
end

app = project.targets.find { |t| t.name == APP_NAME } or abort("#{APP_NAME} target not found")
swift_version = app.build_configurations.map { |c| c.build_settings['SWIFT_VERSION'] }.compact.first || '5.0'

test = project.new_target(:unit_test_bundle, TEST_NAME, :ios, DEPLOYMENT_TARGET, project.products_group, :swift)
test.add_dependency(app)

# `new_target` links Foundation.framework through a reference pinned to one SDK version (and an
# `iOS` group under Frameworks). Swift auto-links it, so drop both.
test.frameworks_build_phase.files.to_a.each do |build_file|
  ref = build_file.file_ref
  build_file.remove_from_project
  next unless ref && ref.build_files.empty?

  parent = ref.parent
  ref.remove_from_project
  parent.remove_from_project if parent.is_a?(Xcodeproj::Project::Object::PBXGroup) && parent.children.empty?
end

test.build_configurations.each do |config|
  settings = config.build_settings
  settings['TEST_HOST'] = "$(BUILT_PRODUCTS_DIR)/#{APP_NAME}.app/$(BUNDLE_EXECUTABLE_FOLDER_PATH)/#{APP_NAME}"
  settings['BUNDLE_LOADER'] = '$(TEST_HOST)'
  settings['IPHONEOS_DEPLOYMENT_TARGET'] = DEPLOYMENT_TARGET
  settings['GENERATE_INFOPLIST_FILE'] = 'YES'
  settings['SWIFT_VERSION'] = swift_version
  settings['PRODUCT_NAME'] = '$(TARGET_NAME)'
  settings['PRODUCT_BUNDLE_IDENTIFIER'] = 'com.nitropasskeysexample.tests'
  settings['TARGETED_DEVICE_FAMILY'] = '1,2'
  settings['CODE_SIGN_STYLE'] = 'Automatic'
  # NitroModules and NitroPasskeys are Swift modules built with C++ interop, so any Swift module
  # that imports them has to enable it too.
  settings['SWIFT_OBJC_INTEROP_MODE'] = 'objcxx'
  # NitroModules' public headers include private ones (BorrowingReference.hpp, …) by bare name,
  # which the aggregate Pods xcconfig does not put on the search path.
  settings['HEADER_SEARCH_PATHS'] = ['$(inherited)', '"${PODS_ROOT}/Headers/Private/NitroModules"']
end

# Group mirrors the on-disk folder; every Swift file in it becomes a test source.
group = project.main_group.find_subpath(TEST_NAME, false) || project.main_group.new_group(TEST_NAME, TEST_NAME)
Dir.glob(File.join(IOS_DIR, TEST_NAME, '*.swift')).sort.each do |path|
  name = File.basename(path)
  ref = group.files.find { |f| f.path == name } || group.new_reference(name)
  test.add_file_references([ref])
end

attributes = project.root_object.attributes['TargetAttributes'] ||= {}
attributes[test.uuid] = { 'CreatedOnToolsVersion' => '16.0', 'TestTargetID' => app.uuid }

project.save

# Shared scheme: drop any stale testable left over from the RN template (it pointed at a target
# that no longer exists), then add the new bundle.
scheme_path = Xcodeproj::XCScheme.shared_data_dir(PROJECT_PATH) + "#{APP_NAME}.xcscheme"
scheme = Xcodeproj::XCScheme.new(scheme_path.to_s)
testables = scheme.test_action.xml_element.elements['Testables']
if testables
  stale = testables.get_elements('TestableReference').select do |ref|
    ref.elements['BuildableReference']&.attributes&.[]('BlueprintName') == TEST_NAME
  end
  stale.each { |ref| testables.delete_element(ref) }
end
scheme.test_action.add_testable(Xcodeproj::XCScheme::TestAction::TestableReference.new(test))
scheme.save_as(PROJECT_PATH, APP_NAME, true)

puts "Added #{TEST_NAME} to #{File.basename(PROJECT_PATH)} and the #{APP_NAME} scheme."
