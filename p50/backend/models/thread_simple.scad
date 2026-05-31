module thread_simple(
    diameter = 20,
    length = 50,
    pitch = 2.5,
    thread_depth = 1.5,
    turns_per_cm = 0
) {
    if (turns_per_cm > 0) {
        pitch = 10 / turns_per_cm;
    }
    
    radius = diameter / 2;
    inner_radius = radius - thread_depth;
    turns = length / pitch;
    
    module thread_tooth() {
        translate([inner_radius, 0, 0])
        linear_extrude(height=pitch * 0.3)
        polygon(points=[
            [0, -pitch * 0.3],
            [thread_depth, -pitch * 0.15],
            [thread_depth, pitch * 0.15],
            [0, pitch * 0.3]
        ]);
    }
    
    module helix() {
        for (t = [0 : 0.05 : turns - 0.05]) {
            translate([0, 0, t * pitch])
            rotate([0, 0, t * 360])
            thread_tooth();
        }
    }
    
    union() {
        cylinder(h=length, r=inner_radius, $fn=max(32, diameter * 2));
        helix();
    }
}

thread_simple(
    diameter=diameter,
    length=length,
    pitch=pitch,
    thread_depth=thread_depth
);