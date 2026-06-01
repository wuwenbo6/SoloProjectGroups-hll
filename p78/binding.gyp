{
  "targets": [
    {
      "target_name": "oscilloscope",
      "sources": [
        "src/cpp/oscilloscope.cpp"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      "libraries": [
        "-lusb-1.0"
      ],
      "defines": [
        "NAPI_DISABLE_CPP_EXCEPTIONS"
      ],
      "conditions": [
        ["OS=='mac'", {
          "xcode_settings": {
            "OTHER_CFLAGS": [
              "-ObjC++",
              "-framework",
              "IOKit",
              "-framework",
              "CoreFoundation"
            ]
          }
        }],
        ["OS=='linux'", {
          "libraries": ["-lusb-1.0"]
        }],
        ["OS=='win'", {
          "libraries": ["libusb-1.0.lib"]
        }]
      ]
    }
  ]
}
