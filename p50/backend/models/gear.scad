module involute_gear(
    module = 2,
    teeth = 20,
    face_width = 10,
    pressure_angle = 20,
    bore_diameter = 8,
    hub_diameter = 0,
    hub_height = 0
) {
    pitch_diameter = module * teeth;
    addendum = module;
    dedendum = 1.25 * module;
    outside_radius = (pitch_diameter / 2) + addendum;
    root_radius = (pitch_diameter / 2) - dedendum;
    base_radius = (pitch_diameter / 2) * cos(pressure_angle);
    
    function involute(r, a) = [
        r * (cos(a) + a * sin(a)),
        r * (sin(a) - a * cos(a))
    ];
    
    function rotate_point(p, a) = [
        p[0] * cos(a) - p[1] * sin(a),
        p[0] * sin(a) + p[1] * cos(a)
    ];
    
    tooth_angle = 360 / teeth;
    half_tooth_angle = tooth_angle / 2;
    
    points = [];
    steps = 10;
    
    for (i = [0:teeth-1]) {
        angle = i * tooth_angle;
        
        for (s = [0:steps]) {
            a = (s / steps) * 40;
            rad_a = a * 3.14159 / 180;
            p = involute(base_radius, rad_a);
            p_rot = rotate_point(p, angle + half_tooth_angle);
            r = sqrt(p_rot[0] * p_rot[0] + p_rot[1] * p_rot[1]);
            if (r <= outside_radius) {
                points = concat(points, [p_rot]);
            } else {
                scale_f = outside_radius / r;
                points = concat(points, [[p_rot[0] * scale_f, p_rot[1] * scale_f]]);
            }
        }
        
        for (s = [steps:-1:0]) {
            a = (s / steps) * 40;
            rad_a = a * 3.14159 / 180;
            p = involute(base_radius, rad_a);
            p[1] = -p[1];
            p_rot = rotate_point(p, angle - half_tooth_angle);
            r = sqrt(p_rot[0] * p_rot[0] + p_rot[1] * p_rot[1]);
            if (r <= outside_radius) {
                points = concat(points, [p_rot]);
            } else {
                scale_f = outside_radius / r;
                points = concat(points, [[p_rot[0] * scale_f, p_rot[1] * scale_f]]);
            }
        }
    }
    
    total_height = max(face_width, hub_height);
    z_offset = hub_height > face_width ? (hub_height - face_width) / 2 : 0;
    
    difference() {
        union() {
            translate([0, 0, z_offset])
            linear_extrude(height=face_width)
            circle(r=outside_radius, $fn=teeth * 12);
            
            if (hub_diameter > 0 && hub_height > 0) {
                translate([0, 0, -hub_height / 2])
                cylinder(h=hub_height, r=hub_diameter / 2, $fn=64);
            }
        }
        
        if (bore_diameter > 0) {
            cylinder(h=total_height + 2, r=bore_diameter / 2, center=true, $fn=64);
        }
    }
    
    for (i = [0:teeth-1]) {
        rotate([0, 0, i * tooth_angle])
        translate([outside_radius - addendum * 1.5, 0, z_offset])
        linear_extrude(height=face_width)
        square([addendum * 2, module * 0.5], center=true);
    }
}

involute_gear(
    module=module,
    teeth=teeth,
    face_width=face_width,
    pressure_angle=pressure_angle,
    bore_diameter=bore_diameter,
    hub_diameter=hub_diameter,
    hub_height=hub_height
);