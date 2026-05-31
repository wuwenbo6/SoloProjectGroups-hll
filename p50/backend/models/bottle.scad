module bottle() {
  difference() {
    cylinder(h=height, r=radius, $fn=segments);
    translate([0, 0, wall_thickness])
    cylinder(h=height, r=radius - wall_thickness, $fn=segments);
  }
  
  translate([0, 0, height])
  cylinder(h=neck_height, r=neck_radius, $fn=segments);
}

bottle();