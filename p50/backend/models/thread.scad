module thread(
    diameter = 20,
    length = 50,
    pitch = 2.5,
    thread_depth = 1.5,
    thread_angle = 60,
    segments_per_turn = 24,
    internal = false
) {
    radius = diameter / 2;
    turns = length / pitch;
    total_segments = floor(turns * segments_per_turn);
    angle_step = 360 / segments_per_turn;
    z_step = pitch / segments_per_turn;
    
    thread_width_at_tip = thread_depth * tan(thread_angle / 2);
    
    points = [];
    faces = [];
    
    for (i = [0 : total_segments]) {
        angle = i * angle_step;
        z = i * z_step;
        rad = angle * 3.14159265 / 180;
        
        outer_r = internal ? radius - thread_depth : radius;
        inner_r = internal ? radius : radius - thread_depth;
        
        x_outer = outer_r * cos(rad);
        y_outer = outer_r * sin(rad);
        x_inner = inner_r * cos(rad);
        y_inner = inner_r * sin(rad);
        
        offset = (i % segments_per_turn) / segments_per_turn * pitch;
        twist_factor = thread_width_at_tip * 0.5;
        
        points = concat(points, [[x_outer, y_outer, z], [x_inner, y_inner, z + twist_factor]]);
    }
    
    for (i = [0 : total_segments - 1]) {
        idx = i * 2;
        faces = concat(faces, [
            [idx, idx + 2, idx + 3, idx + 1],
            [idx, idx + 1, idx + 3, idx + 2]
        ]);
    }
    
    main_cylinder_r = internal ? radius : radius - thread_depth;
    
    difference() {
        if (internal) {
            union() {
                cylinder(h=length + 2, r=radius + 5, center=true, $fn=64);
                translate([0, 0, -1])
                polyhedron(points=points, faces=faces);
            }
            cylinder(h=length + 4, r=radius, center=true, $fn=64);
        } else {
            union() {
                cylinder(h=length, r=main_cylinder_r, $fn=64);
                translate([0, 0, 0])
                polyhedron(points=points, faces=faces);
            }
        }
    }
}

module bolt(
    diameter = 20,
    length = 50,
    pitch = 2.5,
    head_size = 30,
    head_height = 12
) {
    union() {
        thread(
            diameter=diameter,
            length=length,
            pitch=pitch,
            thread_depth=pitch * 0.54,
            internal=false
        );
        
        translate([0, 0, -head_height])
        cylinder(h=head_height, r=head_size / 2, $fn=6);
    }
}

module nut(
    diameter = 20,
    pitch = 2.5,
    width_across_flats = 30,
    height = 15
) {
    difference() {
        cylinder(h=height, r=width_across_flats / 2, $fn=6);
        
        translate([0, 0, -1])
        thread(
            diameter=diameter,
            length=height + 2,
            pitch=pitch,
            thread_depth=pitch * 0.54,
            internal=true
        );
    }
}

if (type == "bolt") {
    bolt(
        diameter=diameter,
        length=length,
        pitch=pitch,
        head_size=head_size,
        head_height=head_height
    );
} else if (type == "nut") {
    nut(
        diameter=diameter,
        pitch=pitch,
        width_across_flats=head_size,
        height=head_height
    );
} else {
    thread(
        diameter=diameter,
        length=length,
        pitch=pitch,
        thread_depth=thread_depth,
        thread_angle=thread_angle,
        internal=internal
    );
}