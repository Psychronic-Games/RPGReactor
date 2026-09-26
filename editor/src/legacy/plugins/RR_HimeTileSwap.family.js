'use strict';
// Hime's Tile Swap: the swap and revert calls. (Mask swaps take a Map_Mask built in Ruby and stay comments.)
module.exports = {
    key: 'himeTileSwap', detect: /\$imported\["TH_TileSwap"\]\s*=\s*true/, plugin: 'RR_HimeTileSwap',
    event: {
        tile_swap: 'this.rrTileSwap?.(%*)', pos_swap: 'this.rrPosSwap?.(%*)', region_swap: 'this.rrRegionSwap?.(%*)',
        tile_revert: 'this.rrTileRevert?.(%*)', pos_revert: 'this.rrPosRevert?.(%*)', region_revert: 'this.rrRegionRevert?.(%*)',
        revert_all: 'this.rrRevertAll?.(%*)'
    }
};
