Petko — iOS / App Store
=======================

Store:       App Store Connect
File:        App.ipa             ← upload THIS in Transporter
Version:     1.4
Build:       5
Bundle ID:   rs.glab.petko

1. Open Transporter (or Xcode Organizer).
2. Deliver App.ipa to App Store Connect.
3. Select the build and submit for review.

Petko.xcarchive is the Xcode archive (rebuild / re-export).
It is NOT uploaded to the store — only the IPA is.

Rebuild: npm run cap:sync:ios && open in Xcode → Product → Archive
