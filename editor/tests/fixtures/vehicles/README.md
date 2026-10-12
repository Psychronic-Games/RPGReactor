Fixtures of the vehicle tests (`editor/tests/vehicles-*.test.cjs`). They are kept here so no test depends on what
the Demo holds that day.

- `ninja-vehicle.json`: the Demo motorcycle's `vehicle` block (`model.json › vehicle`), with its carved parts.
- `ninja-vehicle.uncarved.json`: the same model with no carved part: the wheels are the file's own nodes and the
  steering has no part, so the hands swing by arithmetic.
- `ninja-parts.json`: a test carve made of whole meshes (`model.json › parts`): Steering with Front wheel inside it.
- `ReactorVehicles.smallest.json`, `ReactorVehicles.json`, `ReactorVehicles.full.json`: type lists
  (`data/ReactorVehicles.json`): the smallest record that works, the Demo's, and one with every field written.
- `project/`: a project's two vehicle files in their places (`data/ReactorVehicles.json`,
  `3d/Vehicles/kawashaki_ninja_h2/model.json`). The model's `.glb` is the Demo's and is not copied: a test that
  needs it skips when it is absent.
