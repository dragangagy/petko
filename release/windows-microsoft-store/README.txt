Petko — Windows / Microsoft Store
=================================

Store:       Microsoft Store (Partner Center)
File:        Petko-1.4.0.appx    ← upload THIS
Version:     1.4.0
App ID:      rs.glab.petko
Identity Name: Petko
applicationId: Petko
Publisher display: G-Lab

NSIS .exe CANNOT go to the Store. That installer is in ../windows-direct/.

This pack may use the local/test publisher CN=ms until you set the real
Partner Center identity in electron-builder.yml (appx.publisher).

Rebuild:  npm run win:appx
Stage:    npm run release:stage
