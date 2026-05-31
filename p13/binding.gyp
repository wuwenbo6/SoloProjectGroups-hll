{
  "targets": [
    {
      "target_name": "usb-monitor",
      "sources": [
        "src/addon/usb-monitor.cpp",
        "src/addon/usb-device.cpp"
      ],
      "include_dirs": [
        "<!(node -e \"require('nan')\")"
      ],
      "conditions": [
        ["OS=='mac'", {
          "link_settings": {
            "libraries": [
              "-lusb-1.0"
            ]
          },
          "include_dirs": [
            "/usr/local/include/libusb-1.0",
            "/opt/homebrew/include/libusb-1.0"
          ]
        }],
        ["OS=='linux'", {
          "link_settings": {
            "libraries": [
              "-lusb-1.0"
            ]
          }
        }],
        ["OS=='win'", {
          "link_settings": {
            "libraries": [
              "libusb-1.0.lib"
            ]
          }
        }]
      ]
    }
  ]
}
