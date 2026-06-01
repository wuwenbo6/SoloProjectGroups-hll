(function () {
  "use strict";

  const TABS = ["summary", "pcie_link", "bars", "caps", "hex", "inject"];
  const INJECT_TYPES = [
    { value: "vendor",    label: "Vendor ID (0xDEAD) — usually R/O, safe", danger: false },
    { value: "status",    label: "Status register (0xFFFF / W1C) — clears error flags", danger: false },
    { value: "cacheline", label: "Cache line size (0x42) — safe", danger: false },
    { value: "latency",   label: "Latency timer (0xF8) — safe", danger: false },
  ];

  let state = { bdf: null, tab: "summary", data: null };

  const $tree = $("#tree");
  const $content = $("#content");
  const $meta = $("#meta-text");

  function toast(msg, kind) {
    const t = $("<div class='toast " + (kind || "") + "'>").text(msg).appendTo("body");
    setTimeout(() => t.fadeOut(400, () => t.remove()), 2600);
  }

  function fmt(v) {
    if (v === null || v === undefined) return "—";
    if (typeof v === "boolean") return v ? "yes" : "no";
    return String(v);
  }

  function kv(rows) {
    const $t = $("<table class='kv'>");
    rows.forEach(([k, v]) => {
      $t.append($("<tr>")
        .append($("<th>").text(k))
        .append($("<td>").html(fmt(v))));
    });
    return $t;
  }

  function initTree() {
    $.getJSON("/api/devices")
      .done((res) => {
        $meta.text(res.devices.length + " device(s) found");
        $tree.jstree({
          core: {
            data: res.tree,
            themes: { dots: true, icons: false },
          },
          types: {
            domain:   { icon: false },
            bus:      { icon: false },
            device:   { icon: false },
            function: { icon: false },
          },
          plugins: ["types"],
        }).on("select_node.jstree", (_e, node) => {
          if (node.node.original.type === "function") {
            loadDevice(node.node.original.bdf);
          }
        });
      })
      .fail((xhr) => {
        $meta.text("error: " + (xhr.responseText || xhr.statusText));
        $content.html($("<div class='empty'>").text(
          "Could not reach /sys/bus/pci. Make sure the backend is running on Linux.")));
      });
  }

  function exportTree() {
    $.getJSON("/api/export")
      .done((data) => {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "pci-export-" + new Date().toISOString().replace(/[:.]/g, "-") + ".json";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast("Export downloaded (" + data.metadata.count + " devices)", "ok");
      })
      .fail((xhr) => { toast("Export failed: " + (xhr.responseText || xhr.statusText), "err"); });
  }

  function loadDevice(bdf) {
    state.bdf = bdf;
    $content.html("<div class='empty'>loading " + bdf + "…</div>");
    $.getJSON("/api/device/" + bdf)
      .done((data) => {
        state.data = data;
        render();
      })
      .fail((xhr) => {
        $content.html($("<div class='empty'>").text(
          "Failed to read " + bdf + ": " + (xhr.responseText || xhr.statusText)));
      });
  }

  function headerBadges(d) {
    const badges = [];
    if (d.header_type_name) badges.push($("<span class='badge'>").text("hdr: " + d.header_type_name));
    if (d.is_multi_function) badges.push($("<span class='badge ok'>").text("multi-fn (" + d.device_functions + ")"));
    if (d.vendor_name) badges.push($("<span class='badge'>").text(d.vendor_name));
    if (d.has_backup) badges.push($("<span class='badge warn'>").text("backup exists"));
    return badges;
  }

  function render() {
    const d = state.data;
    if (!d) return;
    $content.empty();

    const $title = $("<h2>").text(d.bdf);
    headerBadges(d).forEach((b) => $title.append(" ", b));
    $content.append($title);

    // Class / device friendly names
    const sub = [];
    if (d.class_name) sub.push(d.class_name);
    if (d.device_name) sub.push(d.device_name);
    if (sub.length) $content.append($("<div>").css({ color: "var(--muted)", marginBottom: 12 }).text(sub.join(" · ")));

    // Multi-function info bar
    if (d.is_multi_function && d.sibling_functions && d.sibling_functions.length > 1) {
      const $mf = $("<div>").css({ marginBottom: 16, padding: 10, background: "var(--panel-2)",
                                    border: "1px solid var(--border)", borderRadius: 6, fontSize: 13 });
      $mf.append($("<strong>").text("Multi-function device  "));
      const $links = $("<span>").css({ fontFamily: "var(--mono)", fontSize: 12 });
      d.sibling_functions.forEach((s, i) => {
        if (s === d.bdf) {
          $links.append($("<span>").css({ color: "var(--fg)", fontWeight: 600 }).text(s));
        } else {
          const $a = $("<a>").text(s).css({ color: "var(--accent)", cursor: "pointer", marginRight: 8 })
            .on("click", () => loadDevice(s));
          $links.append($a);
        }
        if (i < d.sibling_functions.length - 1) $links.append(" | ");
      });
      $mf.append($links);
      $content.append($mf);
    }

    const $tabs = $("<div class='tabs'>");
    TABS.forEach((t) => {
      const $b = $("<button>").text(t).data("tab", t);
      if (state.tab === t) $b.addClass("active");
      $b.on("click", () => { state.tab = t; render(); });
      $tabs.append($b);
    });
    $content.append($tabs);

    if (state.tab === "summary") renderSummary(d);
    else if (state.tab === "pcie_link") renderPCIeLink(d);
    else if (state.tab === "bars") renderBars(d);
    else if (state.tab === "caps") renderCaps(d);
    else if (state.tab === "hex") renderHex(d);
    else if (state.tab === "inject") renderInject(d);
  }

  function renderSummary(d) {
    const rows = [
      ["BDF",            d.bdf],
      ["Vendor ID",      d.vendor_id + (d.vendor_name ? "  (" + d.vendor_name + ")" : "")],
      ["Device ID",      d.device_id + (d.device_name ? "  (" + d.device_name + ")" : "")],
      ["Revision",       d.revision],
      ["Class",          d.class_code_full + (d.class_name ? "  (" + d.class_name + ")" : "")],
      ["Prog IF",        d.prog_if],
      ["Subclass",       d.subclass],
      ["Base Class",     d.class_code],
      ["Command",        d.command + "  <span class='muted'>" + decodeCommand(d.command) + "</span>"],
      ["Status",         d.status + "  <span class='muted'>" + decodeStatus(d.status) + "</span>"],
      ["Cache Line Sz",  d.cache_line_size],
      ["Latency Timer",  d.latency_timer],
      ["Header Type",    d.header_type + " (" + d.header_type_name + ")"],
      ["Multi-Function", d.is_multi_function ? ("yes (" + d.device_functions + " fn's)") : "no"],
      ["BIST",           d.bist],
    ];
    if (d.subsystem_vendor !== undefined) {
      rows.push(["Subsystem Vendor", d.subsystem_vendor]);
      rows.push(["Subsystem Device", d.subsystem_device]);
      rows.push(["Cardbus CIS", d.cardbus_cis]);
      rows.push(["Expansion ROM", d.expansion_rom]);
      rows.push(["Cap Ptr", d.capabilities_ptr]);
      rows.push(["IRQ Line", d.interrupt_line]);
      rows.push(["IRQ Pin", d.interrupt_pin]);
      rows.push(["Min Gnt", d.min_grant]);
      rows.push(["Max Lat", d.max_latency]);
    }
    rows.push(["Backup", d.has_backup
      ? '<span style="color:var(--ok)">exists</span> · <a style="color:var(--accent);cursor:pointer" id="restore-link">restore</a>'
      : '<span style="color:var(--muted)">none</span>']);
    const $kv = kv(rows);
    $content.append($kv);
    const $r = $kv.find("#restore-link");
    if ($r.length) {
      $r.on("click", () => {
        if (!confirm("Restore " + d.bdf + " from backup? This will overwrite the current config space.")) return;
        $.ajax({ url: "/api/device/" + d.bdf + "/restore", method: "POST" })
          .done((r) => { toast("restored: " + r.output, "ok"); loadDevice(d.bdf); })
          .fail((xhr) => { toast("error: " + (xhr.responseText || xhr.statusText), "err"); });
      });
    }
  }

  function decodeCommand(h) {
    const v = parseInt(h, 16);
    const bits = [];
    if (v & 0x001) bits.push("IO");
    if (v & 0x002) bits.push("MEM");
    if (v & 0x004) bits.push("BM");
    if (v & 0x008) bits.push("SPC");
    if (v & 0x010) bits.push("MWI");
    if (v & 0x020) bits.push("VGA");
    if (v & 0x040) bits.push("PERR");
    if (v & 0x100) bits.push("SERR");
    if (v & 0x200) bits.push("FBBE");
    return bits.join("|") || "none";
  }

  function decodeStatus(h) {
    const v = parseInt(h, 16);
    const bits = [];
    if (v & 0x080) bits.push("CAP");
    if (v & 0x100) bits.push("66M");
    if (v & 0x200) bits.push("UDF");
    if (v & 0x400) bits.push("FATAL");
    if (v & 0x800) bits.push("TAPAR");
    if (v & 0x1000) bits.push("TABORT");
    if (v & 0x2000) bits.push("MABORT");
    if (v & 0x4000) bits.push("SERR");
    if (v & 0x8000) bits.push("PERR");
    return bits.join("|") || "none";
  }

  function renderPCIeLink(d) {
    if (!d.pcie_link_status) {
      $content.append($("<div class='empty'>").text("This device does not have a PCI Express capability."));
      return;
    }
    const ls = d.pcie_link_status;
    const $p = $("<div>");
    $p.append($("<h3>").text("Link Status"));
    const matchSpeed = ls.current_speed === ls.max_speed;
    const matchWidth = ls.current_width === ls.max_width;
    const speedRows = [
      ["Current Speed", ls.current_speed + "  " + (matchSpeed
        ? '<span class="badge ok">matches max</span>'
        : '<span class="badge warn">downgraded!</span>')],
      ["Max Speed", ls.max_speed],
      ["Current Width", ls.current_width + "  " + (matchWidth
        ? '<span class="badge ok">matches max</span>'
        : '<span class="badge warn">downgraded!</span>')],
      ["Max Width", ls.max_width],
      ["Training Error", ls.training_error
        ? '<span class="badge warn">YES</span>'
        : '<span class="badge ok">none</span>'],
      ["Training Active", ls.training_active ? "yes" : "no"],
      ["Slot Clock Config", ls.slot_clk ? "yes" : "no"],
      ["Data Link Layer Active", ls.data_link_active ? "yes" : "no"],
    ];
    $p.append(kv(speedRows));

    // Find the full PCIe cap details
    const pcie = (d.capabilities || []).find((c) => c.id_int === 0x10);
    if (pcie) {
      $p.append($("<h3>").text("PCIe Version & Port"));
      $p.append(kv([
        ["Version", pcie.pcie_version_str || "—"],
        ["Port Type", pcie.pcie_port_type_str || "—"],
        ["Slot Implemented", pcie.pcie_slot_implemented ? "yes" : "no"],
      ]));

      $p.append($("<h3>").text("Link Capabilities"));
      const lcRows = [];
      ["link_max_speed", "link_max_width", "link_active_state_pm",
        "link_l0s_exit_latency", "link_l1_exit_latency",
        "link_clock_power", "link_surprise_down",
        "link_downstream_port", "link_active_state_pm_opt"].forEach((k) => {
        if (pcie[k] !== undefined) lcRows.push([k, fmt(pcie[k])]);
      });
      $p.append(kv(lcRows));

      $p.append($("<h3>").text("Device Capabilities"));
      const dcRows = [];
      ["dev_max_payload", "dev_phantom_functions", "dev_ext_tag",
        "dev_l0s_latency", "dev_l1_latency",
        "dev_role_based_error", "dev_extended_tag"].forEach((k) => {
        if (pcie[k] !== undefined) dcRows.push([k, fmt(pcie[k])]);
      });
      $p.append(kv(dcRows));

      $p.append($("<h3>").text("Device Control"));
      const dctrlRows = [];
      ["dev_ctl_correctable_err", "dev_ctl_non_fatal_err", "dev_ctl_fatal_err",
        "dev_ctl_unsupported_req", "dev_ctl_relaxed_ordering",
        "dev_ctl_max_payload", "dev_ctl_extended_tag",
        "dev_ctl_max_read_request"].forEach((k) => {
        if (pcie[k] !== undefined) dctrlRows.push([k, fmt(pcie[k])]);
      });
      $p.append(kv(dctrlRows));

      $p.append($("<h3>").text("Device Status"));
      const dsRows = [];
      ["dev_status_correctable_err", "dev_status_non_fatal_err",
        "dev_status_fatal_err", "dev_status_unsupported_req",
        "dev_status_aux_power", "dev_status_transaction_pending"].forEach((k) => {
        if (pcie[k] !== undefined) dsRows.push([k, fmt(pcie[k])]);
      });
      $p.append(kv(dsRows));

      if (pcie.slot_attention_button !== undefined) {
        $p.append($("<h3>").text("Slot"));
        const slotRows = [];
        ["slot_attention_button", "slot_power_ctl", "slot_mrl",
          "slot_attention_ind", "slot_power_ind", "slot_hot_swap",
          "slot_power_value", "slot_power_scale",
          "slot_physical_number"].forEach((k) => {
          if (pcie[k] !== undefined) slotRows.push([k, fmt(pcie[k])]);
        });
        $p.append(kv(slotRows));
      }
    }
    $content.append($p);
  }

  function renderBars(d) {
    if (!d.bars || !d.bars.length) {
      $content.append($("<div class='empty'>").text("No BARs on this device."));
      return;
    }
    const $wrap = $("<div>");
    d.bars.forEach((b) => {
      const details = $("<details>").attr("open", "open");
      const sum = "BAR" + b.index + ": " + (b.type || "?") +
                  (b.raw ? "  raw=" + b.raw : "") +
                  (b.base !== undefined ? "  base=" + (typeof b.base === "string" ? b.base : ("0x" + b.base.toString(16))) : "");
      details.append($("<summary>").text(sum));
      const rows = [];
      Object.keys(b).forEach((k) => {
        if (k === "index") return;
        rows.push([k, fmt(b[k])]);
      });
      details.append(kv(rows));
      $wrap.append(details);
    });
    $content.append($wrap);
  }

  function renderCaps(d) {
    if (!d.capabilities || !d.capabilities.length) {
      $content.append($("<div class='empty'>").text("No capabilities found."));
      return;
    }
    const $t = $("<table class='kv'>");
    $t.append($("<tr>").append($("<th>").text("#"))
                   .append($("<th>").text("Name"))
                   .append($("<th>").text("ID"))
                   .append($("<th>").text("Offset")));
    d.capabilities.forEach((c, i) => {
      $t.append($("<tr>")
        .append($("<td>").text(i))
        .append($("<td>").text(c.name))
        .append($("<td>").text(c.id))
        .append($("<td>").text(c.offset)));
    });
    $content.append($t);

    // Per-capability detail sections
    d.capabilities.forEach((c) => {
      const keys = Object.keys(c).filter((k) =>
        !["id", "id_int", "offset", "offset_int", "name"].includes(k));
      if (!keys.length) return;
      const $details = $("<details>").attr("open", false);
      $details.append($("<summary>").text(c.name + "  (" + c.offset + ")"));
      const rows = keys.map((k) => [k, fmt(c[k])]);
      $details.append(kv(rows));
      $content.append($details);
    });
  }

  function renderHex(d) {
    const hex = d.hex || "";
    const $p = $("<pre class='hex'>");
    let out = "";
    for (let i = 0; i < hex.length; i += 32) {
      const off = (i / 2);
      const row = hex.substr(i, 32).match(/.{1,2}/g).join(" ");
      const ascii = hex.substr(i, 32).match(/.{1,2}/g).map((b) => {
        const v = parseInt(b, 16);
        return v >= 0x20 && v < 0x7F ? String.fromCharCode(v) : ".";
      }).join("");
      out += ("0000" + off.toString(16)).slice(-4) + "  " + row.padEnd(49) + "  " + ascii + "\n";
    }
    $p.text(out);
    $content.append($p);
  }

  function renderInject(d) {
    const $desc = $("<div>").css({ marginBottom: 12, color: "var(--muted)", fontSize: 13 })
      .text("Use these controls to write into the device config space in order to " +
            "test driver robustness. Every write automatically saves a backup first; " +
            "use Restore in the Summary tab to revert. The pci-helper must be setuid-root.");
    $content.append($desc);

    // Save button
    const $saveRow = $("<div class='row'>").css({ marginBottom: 16 });
    const $saveBtn = $("<button class='primary'>").text("Save current config");
    $saveBtn.on("click", () => {
      $.ajax({ url: "/api/device/" + d.bdf + "/save", method: "POST" })
        .done((r) => { toast("saved: " + r.output, "ok"); state.data.has_backup = true; render(); })
        .fail((xhr) => { toast("error: " + (xhr.responseText || xhr.statusText), "err"); });
    });
    $saveRow.append($saveBtn);
    if (d.has_backup) {
      const $restoreBtn = $("<button>").css({ background: "var(--panel-2)", color: "var(--fg)",
                                               border: "1px solid var(--border)", padding: "6px 14px",
                                               borderRadius: 4, cursor: "pointer" })
        .text("Restore from backup");
      $restoreBtn.on("click", () => {
        if (!confirm("Restore " + d.bdf + " from backup? This will overwrite the current config space.")) return;
        $.ajax({ url: "/api/device/" + d.bdf + "/restore", method: "POST" })
          .done((r) => { toast("restored: " + r.output, "ok"); loadDevice(d.bdf); })
          .fail((xhr) => { toast("error: " + (xhr.responseText || xhr.statusText), "err"); });
      });
      $saveRow.append($restoreBtn);
    }
    $content.append($saveRow);

    // pre-defined injections (command removed from safe list)
    const $f1 = $("<form class='inject'>").on("submit", (e) => {
      e.preventDefault();
      const t = $f1.find("[name=type]").val();
      const opt = INJECT_TYPES.find((o) => o.value === t);
      const msg = "Inject '" + (opt ? opt.label : t) + "' into " + d.bdf + "?\n\n" +
                  "A backup will be saved automatically. You can restore it from the Summary tab.";
      if (!confirm(msg)) return;
      $.ajax({ url: "/api/device/" + d.bdf + "/inject",
               method: "POST",
               contentType: "application/json",
               data: JSON.stringify({ type: t }) })
        .done((r) => { toast("ok: " + (r.output || r.type), "ok"); loadDevice(d.bdf); })
        .fail((xhr) => { toast("error: " + (xhr.responseJSON ? xhr.responseJSON.error : xhr.statusText), "err"); });
    });
    $f1.append($("<label>").attr("for", "itype").text("predefined injection:"));
    const $sel = $("<select name='type'>");
    INJECT_TYPES.forEach((o) => $sel.append($("<option>").val(o.value).text(o.label)));
    $f1.append($sel);
    $f1.append($("<button type='submit' class='danger'>").text("Inject"));
    $content.append($f1);

    // raw write
    const $f2 = $("<form class='inject'>").on("submit", (e) => {
      e.preventDefault();
      const off = parseInt($f2.find("[name=off]").val(), 0);
      const val = $f2.find("[name=val]").val().trim();
      if (isNaN(off) || off < 0 || off > 252) return toast("offset must be 0..252", "err");
      if (!/^0x[0-9a-fA-F]+$/.test(val) && !/^[0-9a-fA-F]+$/.test(val))
        return toast("value must be hex", "err");
      if (off >= 0x04 && off <= 0x05 && (parseInt(val, 16) & 0x3) === 0) {
        if (!confirm("This write may disable IO/MEM decoding on the device, potentially crashing the kernel. Continue?")) return;
      }
      if (!confirm("Write 4 bytes to offset " + ("0x" + off.toString(16)) + " = " + val + "? A backup will be saved.")) return;
      $.ajax({ url: "/api/device/" + d.bdf + "/config",
               method: "POST",
               contentType: "application/json",
               data: JSON.stringify({ offset: off, value: val }) })
        .done((r) => { toast("ok: " + r.output, "ok"); loadDevice(d.bdf); })
        .fail((xhr) => { toast("error: " + (xhr.responseJSON ? xhr.responseJSON.error : xhr.statusText), "err"); });
    });
    $f2.append($("<label>").text("raw write (4 bytes):"));
    $f2.append($("<input name='off' placeholder='offset (e.g. 0x0C)' value='0x0C'>"));
    $f2.append($("<input name='val' placeholder='hex (e.g. 0x42)' value='0x42'>"));
    $f2.append($("<button type='submit' class='primary'>").text("Write"));
    $content.append($f2);
  }

  $(function () {
    initTree();
    $("#export-btn").on("click", exportTree);
    $("#refresh-btn").on("click", () => {
      $tree.jstree("destroy");
      initTree();
      if (state.bdf) loadDevice(state.bdf);
    });
  });
})();
