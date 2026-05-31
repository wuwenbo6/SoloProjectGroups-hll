module gear_simple(
    teeth = 20,
    pitch_diameter = 40,
    face_width = 10,
    tooth_depth = 2.5,
    bore_diameter = 10,
    hub_diameter = 20,
    hub_height = 0
) {
    outer_radius = pitch_diameter / 2 + tooth_depth;
    inner_radius = pitch_diameter / 2 - tooth_depth;
    tooth_angle = 360 / teeth;
    tooth_width = tooth_angle * 0.4;
    
    total_height = max(face_width, hub_height);
    z_offset = hub_height > face_width ? (hub_height - face_width) / 2 : 0;
    
    difference() {
        union() {
            translate([0, 0, z_offset])
            cylinder(h=face_width, r=outer_radius, $fn=teeth * 12);
            
            if (hub_diameter > 0 && hub_height > 0) {
                translate([0, 0, -hub_height / 2])
                cylinder(h=hub_height, r=hub_diameter / 2, $fn=64);
            }
        }
        
        if (bore_diameter > 0) {
            cylinder(h=total_height + 2, r=bore_diameter / 2, center=true, $fn=64);
        }
        
        for (i = [0 : teeth - 1]) {
            rotate([0, 0, i * tooth_angle])
            translate([0, 0, z_offset - 1])
            linear_extrude(height=total_height + 2)
            polygon(points=[
                [inner_radius, -tooth_width / 2],
                [outer_radius + 1, -tooth_width / 2 * 0.6],
                [outer_radius + 1, tooth_width / 2 * 0.6],
                [inner_radius, tooth_width / 2]
            ]);
        }
    }
}

gear_simple(
    teeth=teeth,
    pitch_diameter=pitch_diameter,
    face_width=face_width,
    tooth_depth=tooth_depth,
    bore_diameter=bore_diameter,
    hub_diameter=hub_diameter,
    hub_height=hub_height
);