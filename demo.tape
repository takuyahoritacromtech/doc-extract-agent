# Record the demo GIF with VHS: https://github.com/charmbracelet/vhs
#   vhs demo.tape   →   docs/demo.gif
#
# This records `npm run demo`, the no-API-key sample run, so the GIF can be
# produced without any credentials.

Output docs/demo.gif

Set FontSize 18
Set Width 1200
Set Height 760
Set Padding 18
Set Theme "Dracula"

Type "npm run demo"
Sleep 500ms
Enter
Sleep 4s
