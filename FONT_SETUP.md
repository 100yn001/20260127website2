# Font Setup Instructions

To use EB Garamond font throughout your app, follow these steps:

## 1. Download EB Garamond Fonts

Download the following font files from Google Fonts:
https://fonts.google.com/specimen/EB+Garamond

Required files:
- `EBGaramond-Regular.ttf`
- `EBGaramond-Medium.ttf`
- `EBGaramond-SemiBold.ttf`

## 2. Create Fonts Directory

```bash
mkdir -p assets/fonts
```

## 3. Place Font Files

Move the downloaded `.ttf` files into `/Users/elisaweyer/Desktop/yn/assets/fonts/`

## 4. Update app.json or expo.json

Add to your config:

```json
{
  "expo": {
    "plugins": [
      [
        "expo-font",
        {
          "fonts": [
            "./assets/fonts/EBGaramond-Regular.ttf",
            "./assets/fonts/EBGaramond-Medium.ttf",
            "./assets/fonts/EBGaramond-SemiBold.ttf"
          ]
        }
      ]
    ]
  }
}
```

## 5. Optional: Use Custom Font Hook

The file `hooks/use-loaded-fonts.ts` is already created and ready to use in your root layout.

## Current Status

Currently, the app uses system fonts. Once you add the font files and update the config:
- All text will render in EB Garamond
- Font weights (regular, medium, semibold) will work correctly
- The app will maintain the elegant serif typography from the web version
