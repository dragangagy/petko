Petko — Windows direct / sideload
=================================

NOT for Microsoft Store

File:        Petko-Setup-1.4.0.exe
Version:     1.4.0
App ID:      rs.glab.petko
Publisher:   G-Lab

This is the NSIS installer (Electron). Users run the .exe and install
like a normal desktop app (Start Menu + desktop shortcut).

Microsoft Store will NOT accept this file. For Store upload use:

  ../windows-microsoft-store/   (APPX/MSIX)

Unsigned builds show a SmartScreen warning. OV/EV Authenticode is
required to clear that over time — see STORE.md.

Original: dist/Petko-Setup-1.4.0.exe
Rebuild:  npm run win:build
