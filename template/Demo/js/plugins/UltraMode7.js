//=============================================================================
// Ultra Mode 7
//=============================================================================

var Imported = Imported || {};
Imported.Blizzard_UltraMode7 = {};
Imported.Blizzard_UltraMode7.VERSION = 220;

/*:
@target MZ
@plugindesc Renders the tilemap in 3D. Supports various parameters such as yaw rotation,
pitch, field of view, etc.
@author Blizzard
@url https://forums.rpgmakerweb.com/index.php?threads/ultra-mode-7-rmmv-rmmz.94100

@help Version: 2.2.0

- licensed under BSD License 2.0

--License--

Copyright (c) Boris "Blizzard" Mikić
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1.  Redistributions of source code must retain the above copyright notice,
	this list of conditions and the following disclaimer.

2.  Redistributions in binary form must reproduce the above copyright notice,
	this list of conditions and the following disclaimer in the documentation
	and/or other materials provided with the distribution.

3.  Neither the name of the copyright holder nor the names of its contributors
	may be used to endorse or promote products derived from this software
	without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED.
IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT,
INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT
NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY,
WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
POSSIBILITY OF SUCH DAMAGE.

--Usage and giving credit--

You may use this script for both non-commercial and commercial products without
limitations as long as you fulfill the conditions presented by the above license.
The "complete" way to give credit is to include the license somewhere in your
product (e.g. in the credits screen), but a "simple" way is also acceptable.
The "simple" way to give credit is as follows:

  Ultra Mode 7 licensed under BSD License 2.0
  Copyright (c) Boris "Blizzard" Mikić

Alternatively, if your font doesn't support diacritic characters, you may use this
variant:

  Ultra Mode 7 licensed under BSD License 2.0
  Copyright (c) Boris "Blizzard" Mikic

In general other similar variants are allowed as long as it is clear who the
creator is (e.g. "Ultra Mode 7 created by Blizzard" is acceptable). But if
possible, prefer to use one of the two variants listed above.

If you fail to give credit and/or claim that this work was created by you, this
may result in legal action and/or payment of damages even though this work is
free of charge to use normally.

--Introduction--

Ultra Mode 7 simulates the Mode 7 rendering mode from the SNES by using 3D
rendering. Sprites are scaled appropriately and use additional code to
determine whether they are visible, because of cut-off distance. The view
of a Mode 7 map is defined by the following parameters:

- camera distance
- camera Y position
- field of view
- pitch rotation angle
- yaw rotation angle
- maximum Z coordinate

--Changelog--

v2.2.0:
- fixed compatibility with MZ Core 1.7.0 and later
- fixed handling of LEGACY_SCALING option

v2.1.2:
- added LOOP_MAPS_EXTEND_TILES_SMART option
- fixed configuration issue when upgrading plugin
- fixed crash with looping maps and FOV=90
- fixed a bug in looping maps rendering optimization

v2.1.1:
- fixed issues with fade color setter
- fixed issues with fade begin setter
- fixed issues with fade end setter

v2.1.0:
- refactored some code to improve general compatibility

v2.0.9:
- fixed bug with invisible looped maps

v2.0.8:
- fixed some new issues with Yanfly's Grid-Free Doodads

v2.0.7:
- changed NEAR_CLIP_Z to DEFAULT_NEAR_CLIP_Z
- changed FAR_CLIP_Z to DEFAULT_FAR_CLIP_Z
- added map parameters for Near Clip Z and Far Clip Z
- updated custom Terrax Plugins - Lighting system compatibility code

v2.0.6:
- fixed issues with MZ v1.5.0 core scripts

v2.0.5:
- added CHARACTERS_SHIFT_Y option

v2.0.4:
- fixed some more issues with compatbility for several other plugins

v2.0.3:
- fixed a minor issues with compatbility for several other plugins

v2.0.2:
- fixed roll-rotation issue with ZephAM_YEPDoodadExt
- fixed performance issues on larger maps in RPG Maker MZ
- fixed issue with looping maps in RPG Maker MZ
- fixed minor offset issue with map display in RPG Maker MZ
- enabled CHARACTERS_USE_FADE_Z again by default (RPG Maker MZ has no performance issues)

v2.0.1:
- fixed a minor rendering issue
- improved unified shader code structure

v2.0.0:
- implemented compatibility with RPG Maker MZ

v1.7.6:
- fixed a minor issues with compatbility for Galv Map Projectiles

v1.7.5:
- added compatbility for Galv Map Projectiles

v1.7.4:
- added compatbility for SAN_AnalogMove when PLAYER_ADJUST_MOVE_DIRECTION is turned on
- added roll angle support

v1.7.3:
- fixed loading issues with OcRam_Lights

v1.7.2:
- fixed issues with Yanfly's Grid-Free Doodads in deployed builds
- fixed issues with terrain tag lights in OcRam_Lights
- added safeguards to prevent faulty compatibility code to affect other compatibility code
- limited NEAR_CLIP_Z to a minimum of 1 due to issues with rendering for values of 0 or less
- disabled CHARACTERS_USE_FADE_Z by default due to performance issues

v1.7.1:
- fixed some issues in compatibility code for OcRam_Lights

v1.7.0:
- added compatibility code for OcRam_Lights
- improved compatibility code for KhasUltraLighting

v1.6.5:
- updated some instructions

v1.6.4:
- fixed a const assignment errors

v1.6.3:
- refactored positioning in looped maps
- fixed sprite positioning in looped maps for Yanfly's Grid-Free Doodads
- added CHARACTERS_USE_FADE_Z option
- removed some left-over debug code

v1.6.2:
- attempted fix in Yanfly's Grid-Free Doodads for sprite positioning in looped maps

v1.6.1:
- improved code that handles sprite positioning in looped maps

v1.6.0:
- implemented improved scaling of sprites on map which doesn't get messed up by near and far clipping planes
- changed some of the default parameters to accommodate the fixed scaling issues
- added LEGACY_SCALING parameter for backwards compatibility

v1.5.4:
- fixed bug with screen-to-map calculations when using orthogonal projection

v1.5.3:
- improved compatibility code for KhasUltraLighting

v1.5.2:
- added camera y position

v1.5.1:
- added color fade begin to map parameters
- added color fade end to map parameters

v1.5.0:
- added map parameters for map borders

v1.4.6:
- added compatibility for newer pixi-tilemap versions

v1.4.5:
- added compatibility with Quasi Simple Shadows

v1.4.4:
- added compatibility with Thomas Edison MV
- fixed issue with fixed-coordinate parallax not working

v1.4.3:
- changed NEAR_CLIP_Z from constant to plugin parameter

v1.4.2:
- added new parameter FADE_Z_COLOR
- added option to setup custom fade colors for specific maps
- added option to change fade color at any time

v1.4.1:
- added compatibility with Yanfly's Grid-Free Doodads
- added compatibility with MOG's Character Motion

v1.4.0:
- added new license
- added usage and crediting instructions

v1.3.8:
- added script call to enable/disable pixelated rendering during runtime
- reduced WEBGL_MAX_VERTICES to reduce possibility of glitched rendering

v1.3.7:
- added experimental compatibility for BattleLighting plugin

v1.3.6:
- added experimental compatibility for BattleLighting plugin

v1.3.5:
- corrected some minor positioning and scaling calculation errors
- improved compatibility code for KhasUltraLighting

v1.3.4:
- added compatibility code for KhasUltraLighting
- added compatibility instructions for Terrax Plugins - Lighting system

v1.3.3:
- fixed issue with event visibility on map borders when using looping maps

v1.3.2:
- added coordinate rounding for X and Y coordinates
- improved code that handles sprite visibility when outside of the view frustum
- removed some leftover debug prints

v1.3.1:
- fixed a crash with event testing

v1.3.0:
- implemented map looping functionality
- added workaround for PIXI bug where a lag spike would occur about every 10 seconds
- fixed issue where sprite direction didn't display properly at certain yaw angles
- fixed issue where movement controls didn't adjust to yaw angle
- added CHARACTERS_ADJUST_SPRITE_DIRECTION option
- fixed coordinate offset when using yaw angle

v1.2.4:
- fixed accidental removal of animateCameraDistance function

v1.2.3:
- added parallax distance parameter in maps for parallax movement with yaw and pitch
- renamed "Camera" functions to "CameraDistance"
- fixed bug with parallax scrolling on non-Mode 7 maps
- fixed bug with shaking the screen
- removed FOV limit and implemented orthogonal projection with FOV of 0°

v1.2.2:
- fixed a syntax error that was caused by code cleanup

v1.2.1:
- fixed save data issue

v1.2.0:
- fixed FPS drop problem while moving

v1.1.0:
- added animation function for parameters
- renamed RENDER_PIXELATED option to TILEMAP_PIXELATED
- added CHARACTERS_PIXELATED option
- fixed issue with floating characters
- fixed issue with normal maps not working anymore
- added some code to prevent compatibility issues with some map scripts

--How to use--

Separate maps can control and even dynamically change most paramaters. In
order to turn a normal map into a Mode 7 map, custom parameters need to be
defined in the "Note" section of the map. To use the default values for a
map, simply add the following entry to the map "note":

<UltraMode7>

If any other parameter is defined, this is not necessary. The following
parameters can be defined:

- UltraMode7_FOV
- UltraMode7_Pitch
- UltraMode7_Yaw
- UltraMode7_Roll
- UltraMode7_CameraDistance
- UltraMode7_CameraY
- UltraMode7_NearClipZ
- UltraMode7_FarClipZ
- UltraMode7_FadeColor
- UltraMode7_ParallaxDistance
- UltraMode7_Border
- UltraMode7_BorderHorizontal
- UltraMode7_BorderVertical
- UltraMode7_BorderLeft
- UltraMode7_BorderRight
- UltraMode7_BorderTop
- UltraMode7_BorderBottom

Example:

<UltraMode7_FOV:50>

When multiple parameters are defined, simply add them one after another.
Example:

<UltraMode7_Pitch:50>
<UltraMode7_CameraDistance:400>
<UltraMode7_CameraY:20>
<UltraMode7_Yaw:45>
<UltraMode7_Roll:10>
<UltraMode7_FadeColor:1,1,0.5>
<UltraMode7_ParallaxDistance:800>
<UltraMode7_BorderVertical:4>

--How to change parameters dynamically--

The 4 parameters that can be defined in the note section of a map can also
be changed at any time during the map. Following calls are available:

UltraMode7.setFov(DEGREES)
UltraMode7.setPitch(DEGREES)
UltraMode7.setYaw(DEGREES)
UltraMode7.setRoll(DEGREES)
UltraMode7.setCameraDistance(Z_DISTANCE)
UltraMode7.setCameraY(Y_POSITION)
UltraMode7.setNearClipZ(NEAR_CLIP_Z)
UltraMode7.setFarClipZ(FAR_CLIP_Z)
UltraMode7.setFadeColor(RGB_COLOR)
UltraMode7.setFadeBegin(Z_COORDINATE)
UltraMode7.setFadeEnd(Z_COORDINATE)
UltraMode7.setParallaxDistance(DISTANCE)
UltraMode7.setTilemapPixelated(TRUE_FALSE)

You can also obtain the current values with these calls:

UltraMode7.getFov()
UltraMode7.getPitch()
UltraMode7.getYaw()
UltraMode7.getRoll()
UltraMode7.getCameraDistance()
UltraMode7.getCameraY()
UltraMode7.getNearClipZ()
UltraMode7.getFarClipZ()
UltraMode7.getFadeColor()
UltraMode7.getFadeBegin()
UltraMode7.getFadeEnd()
UltraMode7.getParallaxDistance()
UltraMode7.isTilemapPixelated()

You can also change the values in an animated manner:

UltraMode7.animateFov(TARGET_VALUE, FRAMES_DURATION)
UltraMode7.animatePitch(TARGET_VALUE, FRAMES_DURATION)
UltraMode7.animateYaw(TARGET_VALUE, FRAMES_DURATION)
UltraMode7.animateRoll(TARGET_VALUE, FRAMES_DURATION)
UltraMode7.animateCameraDistance(TARGET_VALUE, FRAMES_DURATION)
UltraMode7.animateCameraY(TARGET_VALUE, FRAMES_DURATION)
UltraMode7.animateNearClipZ(TARGET_VALUE, FRAMES_DURATION)
UltraMode7.animateFarClipZ(TARGET_VALUE, FRAMES_DURATION)
UltraMode7.animateFadeColor(RGB_COLOR, FRAMES_DURATION)
UltraMode7.animateFadeBegin(TARGET_VALUE, FRAMES_DURATION)
UltraMode7.animateFadeEnd(TARGET_VALUE, FRAMES_DURATION)

Notes:

- Most values are plain integer or decimal values, RGB_COLOR is an array of 3
  values. e.g. [1, 1, 0] would be yellow.
- All durations are in frames.

Parallax distance cannot be animated due to its internal implementation relying
on fixed values.

--Additional Notes--

- When using parallax backgrounds due to how rendering is done, it's useful
  to have a custom parallax that fades into white and creates a seamless
  transition into the faded tiles. Make sure to adjust for changes in the
  pitch angle as well.
- Larger values for DEFAULT_NEAR_CLIP_Z can help reduce problems with
  characters becoming very large when they are close to the camera and if a low
  pitch value is used.
- Smaller values of DEFAULT_FAR_CLIP_Z will cause characters and the tilemap
  to be cut off earlier. Effectively it moves the cut-off horizon closer.
- If you don't want white fade-out, set both FADE_Z values to a larger value
  than DEFAULT_FAR_CLIP_Z.
- When the yaw value is changed, characters are turned around accordingly, but
  controls aren't changed.
- Consider using the same values for BASE_SCALE_Z and DEFAULT_CAMERA_DISTANCE.
- Ultra Mode 7 is setup to display the player character in the middle of the
  screen with a pixel-perfect scale of 1:1. When using DEFAULT_CAMERA_Y, keep
  in mind that positioning the camera above or below changes the player
  position in 3D space and you may want to consider using a different value for
  BASE_SCALE_Z.
- If you use a FOV of 0, the display mode will switch to orthogonal projection.
- When using looping maps, the change of FOV, camera distance and far-clip
  Z-plane might require recalculation of the entire tilemap and can cause
  momentary performance drops so it should be used sparingly.
- When using a real-time system with day-night transition, it might be better
  to apply the fade color constantly as a derived value from the day-night
  coloring rather than using fade color animation.
- When using UltraMode7_Border, all other border options will be ignored.
- When using UltraMode7_BorderHorizontal, UltraMode7_BorderLeft and
  UltraMode7_BorderRight will be ignored.
- When using UltraMode7_BorderVertical, UltraMode7_BorderTop and
  UltraMode7_BorderBottom will be ignored.
- Looped maps ignore all border settings.
- If using CHARACTERS_USE_FADE_Z, keep in mind that other plugins might
  override the blend-color value for the sprite or get overridden by
  Ultra Mode 7.

--Technical details, limitations and compatibility--

- While RPG Maker MZ support is available in Ultra Mode 7, not all compatbility
  code for these plugins has been tested with RPG Maker MZ. Please report any
  issues that you might encounter so that they can be fixed.
- If you update from an earlier version, after replacing the actual file,
  you should open up the plugin settings and confirm/close them again.
  Sometimes new features and options are added and this ensures that the
  newer version of the plugin doesn't crash by adding the new options to
  your project's system settings.
- Requires WebGL. Does not work with canvas and due to how canvas works, it
  can never support canvas.
- Due to sprite scaling, how character sprite sheets are organized and how
  pixel interpolation is done when scaling is applied, there can be artifacts
  during rendering of characters. Manipulating the DEFAULT_FAR_CLIP_Z value
  can help remove these artifacts to some degree.
- The tilemap is rendered in its entirety and the projection matrix is used
  to limit visibility. The hardware should take care of optimizing rendering.
- Due to a hard limit of 65536 vertices being rendered at once in WebGL, the
  code has been adjusted to render the tilemap in as many passes as necessary.
  Since some people reported issues even with 65536 vertices, a soft lower
  limit is being used within the script.
- Because the tilemap is rendered entirely flat, tile priority isn't used.
- In RPG Maker MV the option TILEMAP_PIXELATED and change via
  UltraMode7.setTilemapPixelated() affects non-Mode 7 maps as well.
- Scaling has been optimized for usage of an FOV of 60°. Using different
  values will cause some weird scales being used for characters.
- Using low values for FOV will likely cause display issues (except for 0°
  which will activate orthogonal projection).
- Due to yaw rotation requiring turning of characters, 8-directional
  characters sprites might have only limited support.
- When using looping maps, don't make them too small. Event positioning on the
  map border could cause issues otherwise.
- Due to how PRG Maker MV works with blending color and color tints/tones, using
  CHARACTERS_USE_FADE_Z can cause performance issues when moving vertically.
- Possibly not compatible with scripts that manipulate tilemap data too much
  or too deeply.
- Compatible with KhasUltraLighting (MV). Put Ultra Mode 7 BELOW that plugin.
- Compatible with Yanfly's Grid-Free Doodads (MV). Put Ultra Mode 7 BELOW that plugin.
  The "z" coordinate in doodads is not supported.
- Compatible with MOG's Character Motion (MV). Put Ultra Mode 7 BELOW that plugin.
- Compatible with Thomas Edison MV (MV). Put Ultra Mode 7 BELOW that plugin.
- Compatible with Quasi Simple Shadows (MV). Put Ultra Mode 7 BELOW that plugin.
- Compatible with OcRam_Lights (MV). Put Ultra Mode 7 BELOW that plugin.
- Compatible with some newer pixi-tilemap versions (MV).
- Possibly not compatible with custom character objects that don't derive
  from Game_Event.
  
--Custom compatibility code

- This script can be made compatible with the script
  "Terrax Plugins - Lighting system", but due to the way it's
  written, the compatibility needs to be done manually. Find this segment of
  code:

if (flashlight == true) {
	this._maskBitmap.radialgradientFillRect2(lx1, ly1, 0, light_radius, colorvalue, '#000000', ldir, flashlength, flashwidth);
} else {
	this._maskBitmap.radialgradientFillRect(lx1, ly1, 0, light_radius, colorvalue, '#000000', objectflicker, brightness, direction);
}

  Replace it with this:
  
var visible = true;
if (UltraMode7.isActive())
{
	const position = UltraMode7.mapToScreen(lx1, ly1 + ph / 2);
	if ($gameMap.ultraMode7Fov > 0)
	{
		const z = position.z;
		if (z <= $gameMap.ultraMode7NearClipZ && z >= $gameMap.ultraMode7FarClipZ)
		{
			visible = false;
		}
	}
	if (visible)
	{
		const scale = UltraMode7.mapToScreenScale(lx1, ly1);
		lx1 = position.x;
		ly1 = position.y -= ph / 2 * scale;
		light_radius *= scale;
	}
}
if (visible)
{
	if (flashlight === true)
	{
		this._maskBitmap.radialgradientFillRect2(lx1, ly1, 0, light_radius, colorvalue, '#000000', ldir, flashlength, flashwidth);
	}
	else
	{
		this._maskBitmap.radialgradientFillRect(lx1, ly1, 0, light_radius, colorvalue, '#000000', objectflicker, brightness, direction);
	}
}
  
  This will make "Terrax Plugins - Lighting system" work with Ultra Mode 7.

@param FADE_Z_COLOR
@desc Defines the global fade color on the tilemap as RGB in interval [0, 1].
@default 1,1,1

@param FADE_Z_BEGIN
@desc Defines the Z-coordinate at which white fading will start on the tilemap.
@default 500

@param FADE_Z_END
@desc Defines the Z-coordinate at which white fading will be at full on the tilemap.
@default 1150

@param BASE_SCALE_Z
@desc Defines the Z-coordinate at which character scaling is 1.0.
@default 550

@param LEGACY_SCALING
@desc Activates the sprite scaling calculation before v1.6.0.
ON = true, OFF = false
@default false

@param PARALLAX_SCROLL_X_MULTIPLIER
@desc Defines the multiplier for parallax X-scrolling.
@default 0.5

@param PARALLAX_SCROLL_Y_MULTIPLIER
@desc Defines the multiplier for parallax Y-scrolling.
@default 1.0

@param TILEMAP_PIXELATED
@desc Whether the tilemap should be rendered pixelated.
ON = true, OFF = false
@default true

@param CHARACTERS_PIXELATED
@desc Whether the characters should be rendered pixelated.
ON = true, OFF = false
@default true

@param CHARACTERS_ADJUST_SPRITE_DIRECTION
@desc Whether characters should have their sprite direction adjusted to yaw angle.
ON = true, OFF = false
@default true

@param CHARACTERS_USE_FADE_Z
@desc Whether any characters should use the fade-z color.
ON = true, OFF = false
@default true

@param CHARACTERS_SHIFT_Y
@desc How much the shift-Y offset should be applied to characters.
@default 6

@param PLAYER_ADJUST_MOVE_DIRECTION
@desc Whether player directional input should be adjusted to yaw angle.
ON = true, OFF = false
@default true

@param LOOP_MAPS_EXTEND_TILES
@desc The additional tiles that are rendered in looping maps.
@default 2

@param LOOP_MAPS_EXTEND_TILES_SMART
@desc Smarter handling of additional tiles in looping maps (increases only, in steps).
@default true

@param DEFAULT_FOV
@desc Defines the default value for the field-of-view parameter (in degrees).
@default 60

@param DEFAULT_PITCH
@desc Defines the default value for the pitch rotation angle parameter (in degrees).
@default 45

@param DEFAULT_YAW
@desc Defines the default value for the yaw rotation angle parameter (in degrees).
@default 0

@param DEFAULT_ROLL
@desc Defines the default value for the roll rotation angle parameter (in degrees).
@default 0

@param DEFAULT_CAMERA_DISTANCE
@desc Defines the default distance of the camera from the tilemap in screen space.
@default 550

@param DEFAULT_CAMERA_Y
@desc Defines the default y-position of the camera from the tilemap in screen space.
@default 0

@param DEFAULT_NEAR_CLIP_Z
@desc Defines the default minimum Z-coordinate for visibility of tiles and characters.
@default 100

@param DEFAULT_FAR_CLIP_Z
@desc Defines the default maximum Z-coordinate for visibility of tiles and characters.
@default 1200

@param DEFAULT_PARALLAX_DISTANCE
@desc Defines the distance of the parallax from the center position of the camera.
@default 550

*/

//=============================================================================
// Vector3
//=============================================================================

function Vector3()
{
	this.initialize.apply(this, arguments);
}

Vector3.prototype.initialize = function(x, y, z)
{
	this.x = (x || 0);
	this.y = (y || 0);
	this.z = (z || 0);
};

Vector3.prototype.set = function(x, y, z)
{
	this.x = x;
	this.y = y;
	this.z = z;
};

Vector3.prototype.length = function()
{
	return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
};

Vector3.prototype.normalize = function()
{
	var length = this.length();
	if (length !== 0)
	{
		length = 1 / length;
		this.x *= length;
		this.y *= length;
		this.z *= length;
	}
};

Vector3.prototype.negative = function()
{
	this.x = -this.x;
	this.y = -this.y;
	this.z = -this.z;
};

Vector3.prototype.multiply = function(factor)
{
	this.x *= factor;
	this.y *= factor;
	this.z *= factor;
};

Vector3.prototype.plused = function(other)
{
	return new Vector3(this.x + other.x, this.y + other.y, this.z + other.z);
};

Vector3.prototype.minused = function(other)
{
	return new Vector3(this.x - other.x, this.y - other.y, this.z - other.z);
};

Vector3.prototype.averaged = function(other)
{
	return new Vector3((this.x + other.x) / 2, (this.y + other.y) / 2, (this.z + other.z) / 2);
};

Vector3.prototype.dotted = function(other)
{
	return (this.x * other.x + this.y * other.y + this.z * other.z);
};

Vector3.prototype.crossed = function(other)
{
	return new Vector3(this.y * other.z - this.z * other.y, this.z * other.x - this.x * other.z, this.x * other.y - this.y * other.x);
};

//=============================================================================
// Matrix4
//=============================================================================

function Matrix4()
{
	this.initialize.apply(this, arguments);
}

Matrix4.prototype.initialize = function(data)
{
	if (data)
	{
		this.data = data.slice();
	}
	else
	{
		this.data = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
	}
};
	
Matrix4.prototype.setIdentity = function()
{
	this.setZero();
	this.data[0] = this.data[5] = this.data[10] = this.data[15] = 1;
};

Matrix4.prototype.setZero = function()
{
	for (var i = 0; i < 16; ++i)
	{
		this.data[i] = 0;
	}
};

Matrix4.prototype.set = function(data)
{
	this.data = data.slice();
};

Matrix4.prototype.setTranslation = function(vector)
{
	this.setIdentity();
	this.data[12] = vector.x;
	this.data[13] = vector.y;
	this.data[14] = vector.z;
};

Matrix4.prototype.translate = function(x, y, z)
{
	const matrix = new Matrix4();
	matrix.setTranslation(new Vector3(x, y, z));
	this.multiply(matrix);
};

Matrix4.prototype.rotateX = function(angle)
{
	const matrix = new Matrix4();
	matrix.setRotationX(angle);
	this.multiply(matrix);
};

Matrix4.prototype.rotateY = function(angle)
{
	const matrix = new Matrix4();
	matrix.setRotationY(angle);
	this.multiply(matrix);
};

Matrix4.prototype.rotateZ = function(angle)
{
	const matrix = new Matrix4();
	matrix.setRotationZ(angle);
	this.multiply(matrix);
};

Matrix4.prototype.setRotationX = function(angle)
{
	this.setZero();
	const rad = BlizzardUtility.degreesToRadians(angle);
	this.data[0] = this.data[15] = 1;
	this.data[5] = this.data[10] = Math.cos(rad);
	this.data[6] = Math.sin(rad);
	this.data[9] = -this.data[6];
};

Matrix4.prototype.setRotationY = function(angle)
{
	this.setZero();
	const rad = BlizzardUtility.degreesToRadians(angle);
	this.data[5] = this.data[15] = 1;
	this.data[0] = this.data[10] = Math.cos(rad);
	this.data[8] = Math.sin(rad);
	this.data[2] = -this.data[8];
};

Matrix4.prototype.setRotationZ = function(angle)
{
	this.setZero();
	const rad = BlizzardUtility.degreesToRadians(angle);
	this.data[10] = this.data[15] = 1;
	this.data[0] = this.data[5] = Math.cos(rad);
	this.data[1] = Math.sin(rad);
	this.data[4] = -this.data[1];
};

Matrix4.prototype.multiply = function(other)
{
	this.set([this.data[0] * other.data[0] + this.data[4] * other.data[1] + this.data[8] * other.data[2] + this.data[12] * other.data[3],
		this.data[1] * other.data[0] + this.data[5] * other.data[1] + this.data[9] * other.data[2] + this.data[13] * other.data[3],
		this.data[2] * other.data[0] + this.data[6] * other.data[1] + this.data[10] * other.data[2] + this.data[14] * other.data[3],
		this.data[3] * other.data[0] + this.data[7] * other.data[1] + this.data[11] * other.data[2] + this.data[15] * other.data[3],
		this.data[0] * other.data[4] + this.data[4] * other.data[5] + this.data[8] * other.data[6] + this.data[12] * other.data[7],
		this.data[1] * other.data[4] + this.data[5] * other.data[5] + this.data[9] * other.data[6] + this.data[13] * other.data[7],
		this.data[2] * other.data[4] + this.data[6] * other.data[5] + this.data[10] * other.data[6] + this.data[14] * other.data[7],
		this.data[3] * other.data[4] + this.data[7] * other.data[5] + this.data[11] * other.data[6] + this.data[15] * other.data[7],
		this.data[0] * other.data[8] + this.data[4] * other.data[9] + this.data[8] * other.data[10] + this.data[12] * other.data[11],
		this.data[1] * other.data[8] + this.data[5] * other.data[9] + this.data[9] * other.data[10] + this.data[13] * other.data[11],
		this.data[2] * other.data[8] + this.data[6] * other.data[9] + this.data[10] * other.data[10] + this.data[14] * other.data[11],
		this.data[3] * other.data[8] + this.data[7] * other.data[9] + this.data[11] * other.data[10] + this.data[15] * other.data[11],
		this.data[0] * other.data[12] + this.data[4] * other.data[13] + this.data[8] * other.data[14] + this.data[12] * other.data[15],
		this.data[1] * other.data[12] + this.data[5] * other.data[13] + this.data[9] * other.data[14] + this.data[13] * other.data[15],
		this.data[2] * other.data[12] + this.data[6] * other.data[13] + this.data[10] * other.data[14] + this.data[14] * other.data[15],
		this.data[3] * other.data[12] + this.data[7] * other.data[13] + this.data[11] * other.data[14] + this.data[15] * other.data[15]]);
};

Matrix4.prototype.multiplied = function(vector)
{
	return new Vector3(this.data[0] * vector.x + this.data[4] * vector.y + this.data[8] * vector.z + this.data[12],
		this.data[1] * vector.x + this.data[5] * vector.y + this.data[9] * vector.z + this.data[13],
		this.data[2] * vector.x + this.data[6] * vector.y + this.data[10] * vector.z + this.data[14]);
};

Matrix4.prototype.lookAt = function(eye, target, up)
{
	this.setZero();
	const bz = eye.minused(target);
	bz.normalize();
	const bx = up.crossed(bz);
	bx.normalize();
	const by = bz.crossed(bx);
	by.normalize();
	this.data[0] = bx.x;	this.data[1] = by.x;	this.data[2] = bz.x;
	this.data[4] = bx.y;	this.data[5] = by.y;	this.data[6] = bz.y;
	this.data[8] = bx.z;	this.data[9] = by.z;	this.data[10] = bz.z;	this.data[15] = 1;
	eye.negative();
	const b = new Matrix4();
	b.setTranslation(eye);
	this.multiply(b);
};

Matrix4.prototype.setPerspective = function(fov, width, height, nearZ, farZ)
{
	this.setZero();
	const iy = 1 / Math.tan(BlizzardUtility.degreesToRadians(fov * 0.5));
	const zDiff = farZ - nearZ;
	this.data[0] = iy * height / width;
	this.data[5] = iy;
	this.data[10] = -(farZ + nearZ) / zDiff;
	this.data[11] = -1;
	this.data[14] = -2 * farZ * nearZ / zDiff;
};

Matrix4.prototype.setOrthoProjection = function(x, y, width, height)
{
	this.setZero();
	this.data[0] = 2 / width;
	this.data[5] = 2 / height;
	this.data[12] = x * 2 / width;
	this.data[13] = y * 2 / height;
	this.data[15] = 1;
};

Matrix4.prototype.inversed = function()
{
	const invDet = 1 / this.determinant();
	m = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1];
	m[0] = (this.data[5] * this.data[10] - this.data[9] * this.data[6]) * invDet;
	m[1] = -(this.data[1] * this.data[10] - this.data[9] * this.data[2]) * invDet;
	m[2] = (this.data[1] * this.data[6] - this.data[5] * this.data[2]) * invDet;
	m[4] = -(this.data[4] * this.data[10] - this.data[8] * this.data[6]) * invDet;
	m[5] = (this.data[0] * this.data[10] - this.data[8] * this.data[2]) * invDet;
	m[6] = -(this.data[0] * this.data[6] - this.data[4] * this.data[2]) * invDet;
	m[8] = (this.data[4] * this.data[9] - this.data[8] * this.data[5]) * invDet;
	m[9] = -(this.data[0] * this.data[9] - this.data[8] * this.data[1]) * invDet;
	m[10] = (this.data[0] * this.data[5] - this.data[4] * this.data[1]) * invDet;
	m[12] = -(this.data[12] * m[0] + this.data[13] * m[4] + this.data[14] * m[8]);
	m[13] = -(this.data[12] * m[1] + this.data[13] * m[5] + this.data[14] * m[9]);
	m[14] = -(this.data[12] * m[2] + this.data[13] * m[6] + this.data[14] * m[10]);
	return new Matrix4(m);
};

Matrix4.prototype.determinant = function()
{
	return (this.data[0] * this.data[5] * this.data[10] +
		this.data[2] * this.data[4] * this.data[9] +
		this.data[1] * this.data[6] * this.data[8] -
		this.data[2] * this.data[5] * this.data[8] -
		this.data[1] * this.data[4] * this.data[10] -
		this.data[0] * this.data[6] * this.data[9]);
};

Matrix4.prototype.transpose = function()
{
	this.set([this.data[0], this.data[4], this.data[8], this.data[12],
		this.data[1], this.data[5], this.data[9], this.data[13],
		this.data[2], this.data[6], this.data[10], this.data[14],
		this.data[3], this.data[7], this.data[11], this.data[15]]);
};

//=============================================================================
// Ultra Mode 7
//=============================================================================

(function() {

if (!!Graphics.hasWebGL && !Graphics.hasWebGL())
{
	console.error("Ultra Mode 7 requires WebGL support!");
	return;
}

//=============================================================================
// BlizzardUtility
//=============================================================================

if (typeof(BlizzardUtility) === "undefined")
{
	BlizzardUtility = function()
	{
		throw new Error("This is a static class");
	};
}

BlizzardUtility.degreesToRadians = function(degrees)
{
	return (degrees * 0.01745329251994329576923690768489);
};

BlizzardUtility.radiansToDegrees = function(radians)
{
	return (radians * 57.295779513082320876798154814105);
};

BlizzardUtility.hypot = function(x, y)
{
	return Math.sqrt(x * x + y * y);
};

BlizzardUtility.Numeric = function(value, defaultValue)
{
	const result = Number(value);
	return (result || result === 0 ? result : defaultValue);
};

BlizzardUtility.Bool = function(value, defaultValue)
{
	return (value !== undefined && (value === "true" || value === "false") ? (value !== "false") : defaultValue);
};

//=============================================================================
// UltraMode7
//=============================================================================

UltraMode7 = {};

UltraMode7.log = function(message)
{
	console.log("Ultra Mode 7: " + message);
};

// constants
// NOTE: Don't change these unless you know what you are doing!

UltraMode7.WEBGL_MAX_VERTICES = 65520; // stay under the WebGL limit of 65536
UltraMode7.FLOAT_SIZE = 4;
UltraMode7.MIN_FOV = 0;
UltraMode7.MIN_PITCH = 0;
UltraMode7.MAX_PITCH = 90;
UltraMode7.RMMZ_TEXTURE_SIZE = 2048;
UltraMode7.IS_RMMZ = (Utils.RPGMAKER_NAME === "MZ");
UltraMode7.IS_RMMV = !UltraMode7.IS_RMMZ;

// configuration parameters

const _parameters = PluginManager.parameters("UltraMode7");
UltraMode7.FADE_Z_COLOR = JSON.parse("[" + _parameters["FADE_Z_COLOR"] + "]");
UltraMode7.FADE_Z_BEGIN = BlizzardUtility.Numeric(_parameters["FADE_Z_BEGIN"], 500);
UltraMode7.FADE_Z_END = BlizzardUtility.Numeric(_parameters["FADE_Z_END"], 1150);
UltraMode7.BASE_SCALE_Z = BlizzardUtility.Numeric(_parameters["BASE_SCALE_Z"], 550);
UltraMode7.LEGACY_SCALING = BlizzardUtility.Bool(_parameters["LEGACY_SCALING"], false);
UltraMode7.PARALLAX_SCROLL_X_MULTIPLIER = BlizzardUtility.Numeric(_parameters["PARALLAX_SCROLL_X_MULTIPLIER"], 0.5);
UltraMode7.PARALLAX_SCROLL_Y_MULTIPLIER = BlizzardUtility.Numeric(_parameters["PARALLAX_SCROLL_Y_MULTIPLIER"], 1.0);
UltraMode7.TILEMAP_PIXELATED = BlizzardUtility.Bool(_parameters["TILEMAP_PIXELATED"], true);
UltraMode7.CHARACTERS_PIXELATED = BlizzardUtility.Bool(_parameters["CHARACTERS_PIXELATED"], true);
UltraMode7.CHARACTERS_ADJUST_SPRITE_DIRECTION = BlizzardUtility.Bool(_parameters["CHARACTERS_ADJUST_SPRITE_DIRECTION"], true);
UltraMode7.CHARACTERS_USE_FADE_Z = BlizzardUtility.Bool(_parameters["CHARACTERS_USE_FADE_Z"] , true);
UltraMode7.CHARACTERS_SHIFT_Y = BlizzardUtility.Numeric(_parameters["CHARACTERS_SHIFT_Y"], 6);
UltraMode7.PLAYER_ADJUST_MOVE_DIRECTION = BlizzardUtility.Bool(_parameters["PLAYER_ADJUST_MOVE_DIRECTION"], true);
UltraMode7.LOOP_MAPS_EXTEND_TILES = Math.max(BlizzardUtility.Numeric(_parameters["LOOP_MAPS_EXTEND_TILES"], 2), 0);
UltraMode7.LOOP_MAPS_EXTEND_TILES_SMART = BlizzardUtility.Bool(_parameters["LOOP_MAPS_EXTEND_TILES_SMART"], true);
UltraMode7.DEFAULT_FOV = BlizzardUtility.Numeric(_parameters["DEFAULT_FOV"], 60);
UltraMode7.DEFAULT_PITCH = BlizzardUtility.Numeric(_parameters["DEFAULT_PITCH"], 45);
UltraMode7.DEFAULT_YAW = BlizzardUtility.Numeric(_parameters["DEFAULT_YAW"], 0);
UltraMode7.DEFAULT_ROLL = BlizzardUtility.Numeric(_parameters["DEFAULT_ROLL"], 0);
UltraMode7.DEFAULT_CAMERA_DISTANCE = Math.max(BlizzardUtility.Numeric(_parameters["DEFAULT_CAMERA_DISTANCE"], 550), 0);
UltraMode7.DEFAULT_CAMERA_Y = BlizzardUtility.Numeric(_parameters["DEFAULT_CAMERA_Y"], 0);
UltraMode7.DEFAULT_NEAR_CLIP_Z = Math.max(BlizzardUtility.Numeric(_parameters["DEFAULT_NEAR_CLIP_Z"], 100), 1);
UltraMode7.DEFAULT_FAR_CLIP_Z = Math.max(BlizzardUtility.Numeric(_parameters["DEFAULT_FAR_CLIP_Z"], 1200), UltraMode7.DEFAULT_NEAR_CLIP_Z + 1);
UltraMode7.DEFAULT_PARALLAX_DISTANCE = Math.max(BlizzardUtility.Numeric(_parameters["DEFAULT_PARALLAX_DISTANCE"], 550), 1);

// validation of parameters

UltraMode7.validateFadeColor = function(color)
{
	if (!Array.isArray(color) || color.length !== 3)
	{
		UltraMode7.log("Parameter for 'fade Z color' is malformed! Defaulting back to '1,1,1'.");
		return [1.0, 1.0, 1.0];
	}
	return [color[0].clamp(0.0, 1.0), color[1].clamp(0.0, 1.0), color[2].clamp(0.0, 1.0)];
};

UltraMode7.FADE_Z_COLOR = UltraMode7.validateFadeColor(UltraMode7.FADE_Z_COLOR);

// additional compatibility code

if (UltraMode7.IS_RMMV)
{
	UltraMode7.NEWER_PIXI_TILEMAP = !!PIXI.tilemap.RectTileLayer.prototype.renderWebGLCore;
	if (UltraMode7.NEWER_PIXI_TILEMAP)
	{
		UltraMode7.log("Detected a newer 'pixi-tilemap' implementation, enabling compatibility code.");
	}
}

// interface functions for plugin calls

UltraMode7.getFov = function()
{
	return $gameMap.ultraMode7Fov;
};

UltraMode7.setFov = function(value)
{
	$gameMap.setUltraMode7Fov(value);
};

UltraMode7.getPitch = function()
{
	return $gameMap.ultraMode7Pitch;
};

UltraMode7.setPitch = function(value)
{
	$gameMap.setUltraMode7Pitch(value);
};

UltraMode7.getYaw = function()
{
	return $gameMap.ultraMode7Yaw;
};

UltraMode7.setYaw = function(value)
{
	$gameMap.setUltraMode7Yaw(value);
};

UltraMode7.getRoll = function()
{
	return $gameMap.ultraMode7Roll;
};

UltraMode7.setRoll = function(value)
{
	$gameMap.setUltraMode7Roll(value);
};

UltraMode7.getCameraDistance = function()
{
	return $gameMap.ultraMode7CameraDistance;
};

UltraMode7.setCameraDistance = function(value)
{
	$gameMap.setUltraMode7CameraDistance(value);
};

UltraMode7.getCameraY = function()
{
	return $gameMap.ultraMode7CameraY;
};

UltraMode7.setCameraY = function(value)
{
	$gameMap.setUltraMode7CameraY(value);
};

UltraMode7.getNearClipZ = function()
{
	return $gameMap.ultraMode7NearClipZ;
};

UltraMode7.setNearClipZ = function(value)
{
	$gameMap.setUltraMode7NearClipZ(value);
};

UltraMode7.getFarClipZ = function()
{
	return $gameMap.ultraMode7FarClipZ;
};

UltraMode7.setFarClipZ = function(value)
{
	$gameMap.setUltraMode7FarClipZ(value);
};

UltraMode7.getParallaxDistance = function()
{
	return $gameMap.ultraMode7ParallaxDistance;
};

UltraMode7.setParallaxDistance = function(value)
{
	$gameMap.setUltraMode7ParallaxDistance(value);
};

UltraMode7.isTilemapPixelated = function()
{
	return UltraMode7.TILEMAP_PIXELATED;
};

UltraMode7.setTilemapPixelated = function(value)
{
	UltraMode7.TILEMAP_PIXELATED = value;
	if (UltraMode7.IS_RMMV)
	{
		if (value)
		{
			PIXI.tilemap.TileRenderer.SCALE_MODE = PIXI.SCALE_MODES.NEAREST;
		}
		else
		{
			PIXI.tilemap.TileRenderer.SCALE_MODE = PIXI.SCALE_MODES.LINEAR;
		}
	}
};

UltraMode7.getFadeColor = function()
{
	return $gameMap.ultraMode7FadeColor;
};

UltraMode7.setFadeColor = function(value)
{
	$gameMap.setUltraMode7FadeColor(value);
};

UltraMode7.getFadeBegin = function()
{
	return $gameMap.ultraMode7FadeBegin;
};

UltraMode7.setFadeBegin = function(value)
{
	$gameMap.setUltraMode7FadeBegin(value);
};

UltraMode7.getFadeEnd = function()
{
	return $gameMap.ultraMode7FadeEnd;
};

UltraMode7.setFadeEnd = function(value)
{
	$gameMap.setUltraMode7FadeEnd(value);
};

UltraMode7.animateFov = function(target, frameDuration)
{
	$gameMap.animateUltraMode7Fov(target, frameDuration);
};

UltraMode7.animatePitch = function(target, frameDuration)
{
	$gameMap.animateUltraMode7Pitch(target, frameDuration);
};

UltraMode7.animateYaw = function(target, frameDuration)
{
	$gameMap.animateUltraMode7Yaw(target, frameDuration);
};

UltraMode7.animateRoll = function(target, frameDuration)
{
	$gameMap.animateUltraMode7Roll(target, frameDuration);
};

UltraMode7.animateCameraDistance = function(target, frameDuration)
{
	$gameMap.animateUltraMode7CameraDistance(target, frameDuration);
};

UltraMode7.animateCameraY = function(target, frameDuration)
{
	$gameMap.animateUltraMode7CameraY(target, frameDuration);
};

UltraMode7.animateNearClipZ = function(target, frameDuration)
{
	$gameMap.animateUltraMode7NearClipZ(target, frameDuration);
};

UltraMode7.animateFarClipZ = function(target, frameDuration)
{
	$gameMap.animateUltraMode7FarClipZ(target, frameDuration);
};

UltraMode7.animateFadeColor = function(target, frameDuration)
{
	$gameMap.animateUltraMode7FadeColor(target, frameDuration);
};

UltraMode7.animateFadeBegin = function(target, frameDuration)
{
	$gameMap.animateUltraMode7FadeBegin(target, frameDuration);
};

UltraMode7.animateFadeEnd = function(target, frameDuration)
{
	$gameMap.animateUltraMode7FadeEnd(target, frameDuration);
};

// functions

UltraMode7.isActive = function()
{
	return (!!$dataMap && !!$gameMap && $gameMap.useUltraMode7);
};

UltraMode7.screenToMap = function(x, y)
{
	// transform 2 point ray from projection into world
	const projectionMatrix = $gameMap.ultraMode7ProjectionMatrix;
	const halfWidth = Graphics.width / 2;
	const halfHeight = Graphics.height / 2;
	var origin = new Vector3(x - halfWidth, y - halfHeight, -1);
	var target = new Vector3(x - halfWidth, y - halfHeight, 1);
	if ($gameMap.ultraMode7Fov > 0)
	{
		const scaleZ = projectionMatrix.data[10];
		const offsetZ = projectionMatrix.data[14];
		origin.x = origin.x * (offsetZ - origin.z) / scaleZ / halfWidth;
		origin.y = origin.y * (offsetZ - origin.z) / scaleZ / halfHeight;
		target.x = target.x * (offsetZ - target.z) / scaleZ / halfWidth;
		target.y = target.y * (offsetZ - target.z) / scaleZ / halfHeight;
		const inversedProjectionMatrix = projectionMatrix.inversed();
		origin = inversedProjectionMatrix.multiplied(origin);
		target = inversedProjectionMatrix.multiplied(target);
	}
	const mapWidth = $gameMap.width() * $gameMap.tileWidth();
	const mapHeight = $gameMap.height() * $gameMap.tileHeight();
	// first transform 4 points from model into world space
	const modelviewMatrix = $gameMap.ultraMode7ModelviewMatrix;
	const topLeft = modelviewMatrix.multiplied(new Vector3(0, 0, 0));
	const topRight = modelviewMatrix.multiplied(new Vector3(mapWidth, 0, 0));
	const bottomLeft = modelviewMatrix.multiplied(new Vector3(0, mapHeight, 0));
	const bottomRight = modelviewMatrix.multiplied(new Vector3(mapWidth, mapHeight, 0));
	// solve equation Ax + By + Cz + D = 0
	const equations = [
		[topLeft.x, topLeft.y, topLeft.z, 0],
		[topRight.x, topRight.y, topRight.z, 0],
		[bottomLeft.x, bottomLeft.y, bottomLeft.z, 0],
		[bottomRight.x, bottomRight.y, bottomRight.z, 0]
	];
	const factors = UltraMode7._solveLinearEquationWithGaussianElimination(equations);
	// create plane equation
	const ray = target.minused(origin);
	const normal = new Vector3(factors[0], factors[1], factors[2]);
	ray.multiply((factors[3] - normal.dotted(origin)) / normal.dotted(ray));
	const intersection = origin.plused(ray);
	return modelviewMatrix.inversed().multiplied(intersection);
};

UltraMode7._solveLinearEquationWithGaussianElimination = function(M)
{
	const mLength = M.length;
	for (var i = 0; i < mLength; ++i)
	{
		M[i].push(1);
	}
	for (var i = 0; i < mLength; ++i)
	{
		// Search for maximum in this column
		var maxElement = Math.abs(M[i][i]);
		var maxRow = i;
		for (var k = i + 1; k < mLength; ++k)
		{
			const newMax = Math.abs(M[k][i]);
			if (maxElement < newMax)
			{
				maxElement = newMax;
				maxRow = k;
			}
		}
		// Swap maximum row with current row (column by column)
		for (var k = i; k < mLength + 1; ++k)
		{
			const swap = M[maxRow][k];
			M[maxRow][k] = M[i][k];
			M[i][k] = swap;
		}
		if (M[i][i] !== 0)
		{
			// Make all rows below this one 0 in current column
			for (var k = i + 1; k < mLength; ++k)
			{
				const value = -M[k][i] / M[i][i];
				for (var j = i; j < mLength + 1; ++j)
				{
					if (i === j)
					{
						M[k][j] = 0;
					}
					else
					{
						M[k][j] += value * M[i][j];
					}
				}
			}
		}
	}
	// Solve equation Mx=b for the upper triangular matrix M
	result = [];
	for (var i = mLength - 1; i >= 0; --i)
	{ 
		if (M[i][i] === 0)
		{
			result[i] = 1;
		}
		else
		{
			result[i] = M[i][mLength] / M[i][i];
		}
		for (var k = i - 1; k >= 0; --k)
		{
			M[k][mLength] -= M[k][i] * result[i];
		}
	}
	return result;
};

UltraMode7.mapToScreen = function(x, y, z)
{
	const position = new Vector3(x + $gameMap.displayX() * $gameMap.tileWidth(), y + $gameMap.displayY() * $gameMap.tileHeight(), (z || 0));
	const worldPosition = $gameMap.ultraMode7ModelviewMatrix.multiplied(position);
	const projection = $gameMap.ultraMode7ProjectionMatrix;
	const result = projection.multiplied(worldPosition);
	// W is needed for perspective projection
	const vectorW = projection.data[3] * worldPosition.x + projection.data[7] * worldPosition.y + projection.data[11] * worldPosition.z + projection.data[15];
	// calculate perspective projection and offset to screen coordinates
	const halfWidth = Graphics.width / 2;
	const halfHeight = Graphics.height / 2;
	result.x = result.x * halfWidth / vectorW + halfWidth - $gameScreen.shake();
	result.y = result.y * halfHeight / vectorW + halfHeight;
	if (!UltraMode7.LEGACY_SCALING)
	{
		const factor = -projection.data[10];
		result.z = result.z / factor + (factor - 1) / factor * $gameMap.ultraMode7FarClipZ;
	}
	return result;
};

UltraMode7.mapToScreenScale = function(x, y, z)
{
	if ($gameMap.ultraMode7Fov <= 0)
	{
		return 1.0;
	}
	return UltraMode7.mapZToScreenScale(UltraMode7.mapToScreen(x, y, z).z);
};

UltraMode7.mapZToScreenScale = function(z)
{
	// clamping to 10000 for safety infinity
	return (z !== 0.0 ? UltraMode7.BASE_SCALE_Z / Math.abs(z).clamp(0.0, 10000.0) : 10000.0);
};

UltraMode7.isVisibleByZ = function(z)
{
	return (z > $gameMap.ultraMode7NearClipZ && z < $gameMap.ultraMode7FarClipZ);
};

UltraMode7.rotateDirection = function(direction, clockwise)
{
	const angle = $gameMap.ultraMode7Yaw.mod(360);
	if (clockwise && angle >= 45 && angle <= 135 || !clockwise && angle >= 225 && angle <= 315)
	{
		switch (direction)
		{
		case 2:	direction = 4;	break;
		case 4:	direction = 8;	break;
		case 6:	direction = 2;	break;
		case 8:	direction = 6;	break;
		default: 				break;
		}
	}
	else if (angle > 135 && angle < 225)
	{
		direction = 10 - direction;
	}
	else if (!clockwise && angle >= 45 && angle <= 135 || clockwise && angle >= 225 && angle <= 315)
	{
		switch (direction)
		{
		case 2:	direction = 6;	break;
		case 4:	direction = 2;	break;
		case 6:	direction = 8;	break;
		case 8:	direction = 4;	break;
		default: 				break;
		}
	}
	return direction;
};

UltraMode7.generateFragmentShader = function(source, maxTextures)
{
	return source.replace(/%count%/gi, "" + maxTextures)
		.replace(/%textureloop%/gi, this._generateFragmentShaderTextures(maxTextures));
}

UltraMode7._generateFragmentShaderTextures = function(maxTextures)
{
	var result = "if (textureId < 0)\n\
		{\n\
			color = shadowColor;\n\
		}\n";
	const textures = [];
	for (var i = 0; i < maxTextures; ++i)
	{
		textures.push("\
		else if (textureId == " + i + ")\n\
		{\n\
			color = texture2D(uSamplers[" + i + "], textureCoord * uSamplerSize[" + i + "]);\n\
		}");
	}
	result += textures.join("\n");
	return result;
}

//=============================================================================
// Tilemap
//=============================================================================

Tilemap.ULTRA_MODE_7_VERTEX_SHADER = "\
	attribute float aTextureId;\n\
	attribute vec4 aFrame;\n\
	attribute vec2 aTextureCoord;\n\
	attribute vec2 aVertexPosition;\n\
	attribute vec2 aAnimation;\n\
	\n\
	uniform mat4 uMode7ProjectionMatrix;\n\
	uniform mat4 uMode7ModelviewMatrix;\n\
	uniform float uFadeBegin;\n\
	uniform float uFadeRange;\n\
	uniform vec2 animationFrame;\n\
	\n\
	varying vec4 vFrame;\n\
	varying vec2 vTextureCoord;\n\
	varying float vTextureId;\n\
	varying float vFade;\n\
	\n\
	void main(void)\n\
	{\n\
		vec4 position = uMode7ModelviewMatrix * vec4(aVertexPosition, 0.0, 1.0);\n\
		position = uMode7ProjectionMatrix * vec4(position.x, position.y, position.z, position.w);\n\
		gl_Position = position;\n\
		vec2 offset = aAnimation * animationFrame;\n\
		vTextureCoord = aTextureCoord + offset;\n\
		vFrame = aFrame + vec4(offset, offset);\n\
		vTextureId = aTextureId;\n\
		vFade = clamp((position.z - uFadeBegin) / uFadeRange, 0.0, 1.0);\n\
	}\n";

Tilemap.ULTRA_MODE_7_FRAGMENT_SHADER = "\
	varying vec4 vFrame;\n\
	varying vec2 vTextureCoord;\n\
	varying float vTextureId;\n\
	varying float vFade;\n\
	\n\
	uniform vec4 shadowColor;\n\
	uniform vec3 uFadeColor;\n\
	uniform sampler2D uSamplers[%count%];\n\
	uniform vec2 uSamplerSize[%count%];\n\
	\n\
	void main(void)\n\
	{\n\
		vec2 textureCoord = clamp(vTextureCoord, vFrame.xy, vFrame.zw);\n\
		int textureId = int(floor(vTextureId + 0.5));\n\
		vec4 color;\n\
		%textureloop%\n\
		if (color.a < 0.01)\n\
		{\n\
			discard;\n\
		}\n\
		vec3 multipliedFadeColor = vec3(color.a, color.a, color.a) * uFadeColor;\n\
		gl_FragColor = vec4(mix(color.rgb, multipliedFadeColor, vFade), color.a);\n\
	}\n";
	
const UltraMode7_Tilemap_prototype_initialize = Tilemap.prototype.initialize;
Tilemap.prototype.initialize = function()
{
	if (!UltraMode7.isActive())
	{
		UltraMode7_Tilemap_prototype_initialize.call(this);
		return;
	}
	const _createLayers = this._createLayers;
	const refresh = this.refresh;
	this._createLayers = this.refresh = function() { };
	UltraMode7_Tilemap_prototype_initialize.call(this);
	this._margin = 0;
	this._width = $gameMap.width() * $gameMap.tileWidth();
	this._height = $gameMap.height() * $gameMap.tileHeight();
	if (UltraMode7.IS_RMMV)
	{
		this._layerWidth = 0;
		this._layerHeight = 0;
		this._lastTiles = [];
	}
	this._createLayers = _createLayers;
	this.refresh = _createLayers;
	this._createLayers();
	this.refresh();
};

Tilemap.prototype._makeMarginX = function()
{
	if ($gameMap.isLoopHorizontal())
	{
		var extendTiles = UltraMode7.LOOP_MAPS_EXTEND_TILES;
		if (UltraMode7.LOOP_MAPS_EXTEND_TILES_SMART)
		{
			extendTiles *= 2;
		}
		return ($gameMap.ultraMode7LoopMapsExtendX + extendTiles) * this.tileWidth - Graphics.width / 2;
	}
	return 0;
};

Tilemap.prototype._makeMarginY = function()
{
	if ($gameMap.isLoopVertical())
	{
		var extendTiles = UltraMode7.LOOP_MAPS_EXTEND_TILES;
		if (UltraMode7.LOOP_MAPS_EXTEND_TILES_SMART)
		{
			extendTiles *= 2;
		}
		return ($gameMap.ultraMode7LoopMapsExtendY + extendTiles) * this.tileHeight - Graphics.height / 2;
	}
	return 0;
};

//=============================================================================
// Default code (RMMZ)
//=============================================================================
if (UltraMode7.IS_RMMZ)
{
	//=============================================================================
	// Tilemap
	//=============================================================================

	const UltraMode7_Tilemap_prototype_updateTransform = Tilemap.prototype.updateTransform;
	Tilemap.prototype.updateTransform = function()
	{
		if (!UltraMode7.isActive())
		{
			UltraMode7_Tilemap_prototype_updateTransform.call(this);
			return;
		}
		const startX = Math.floor(-this._makeMarginX() / this.tileWidth);
		const startY = Math.floor(-this._makeMarginY() / this.tileHeight);
		if (this._needsRepaint || this._lastStartX !== startX || this._lastStartY !== startY)
		{
			this._lastStartX = startX;
			this._lastStartY = startY;
			this._addAllSpots(startX, startY);
			this._needsRepaint = false;
		}
		this._lowerLayer.setAnimationFrame(this.animationFrame);
		this._upperLayer.setAnimationFrame(this.animationFrame);
		this._sortChildren();
		PIXI.Container.prototype.updateTransform.call(this);
	};
	
	const UltraMode7_Tilemap_prototype__createLayers = Tilemap.prototype._createLayers;
	Tilemap.prototype._createLayers = function()
	{
		UltraMode7_Tilemap_prototype__createLayers.call(this);
		if (UltraMode7.isActive())
		{
			this._upperLayer.z = 0;
			// width/height forcing is needed, because some scripts manipulate the width and height values of the tilemap
			this._width = $gameMap.width() * $gameMap.tileWidth();
			this._height = $gameMap.height() * $gameMap.tileHeight();
			if ($gameMap.isLoopHorizontal())
			{
				this._width += Graphics.width;
			}
			if ($gameMap.isLoopVertical())
			{
				this._height += Graphics.height;
			}
		}
	};
	
	const UltraMode7_Tilemap_prototype__addAllSpots = Tilemap.prototype._addAllSpots;
	Tilemap.prototype._addAllSpots = function(startX, startY)
	{
		if (!UltraMode7.isActive())
		{
			UltraMode7_Tilemap_prototype__addAllSpots.call(this, startX, startY);
			return;
		}
		this._lowerLayer.clear();
		this._upperLayer.clear();
		const tileCols = Math.ceil(this._width / this.tileWidth);
		const tileRows = Math.ceil(this._height / this.tileHeight);
		for (var y = startY; y < tileRows - startY; ++y)
		{
			for (var x = startX; x < tileCols - startX; ++x)
			{
				this._addSpot(0, 0, x, y);
			}
		}
	};
	
	const UltraMode7_Tilemap_prototype__addAutotile = Tilemap.prototype._addAutotile;
	Tilemap.prototype._addAutotile = function(layer, tileId, dx, dy)
	{
		if (!UltraMode7.isActive() || !Tilemap.isTileA1(tileId))
		{
			UltraMode7_Tilemap_prototype__addAutotile.call(this, layer, tileId, dx, dy);
			return;
		}
		const kind = Tilemap.getAutotileKind(tileId);
		if (kind === 2 || kind === 3)
		{
			UltraMode7_Tilemap_prototype__addAutotile.call(this, layer, tileId, dx, dy);
			return;
		}
		const tx = kind % 8;
		const ty = Math.floor(kind / 8);
		var bx = 0;
		var by = 0;
		var ax = 0;
		var ay = 0;
		var autotileTable = Tilemap.FLOOR_AUTOTILE_TABLE;
		if (kind === 0)
		{
			ax = 2;
		}
		else if (kind === 1)
		{
			ax = 2;
			by = 3;
		}
		else
		{
			bx = Math.floor(tx / 4) * 8;
			by = ty * 6 + (Math.floor(tx / 2) % 2) * 3;
			if (kind % 2 === 0)
			{
				ax = 2;
			}
			else
			{
				bx += 6;
				autotileTable = Tilemap.WATERFALL_AUTOTILE_TABLE;
				ay = 1;
			}
		}
		const shape = Tilemap.getAutotileShape(tileId);
		const table = autotileTable[shape];
		const w1 = this.tileWidth / 2;
		const h1 = this.tileHeight / 2;
		ax *= 2 * w1;
		ay *= 2 * h1;
		for (var i = 0; i < 4; ++i)
		{
			const qsx = table[i][0];
			const qsy = table[i][1];
			const sx1 = (bx * 2 + qsx) * w1;
			const sy1 = (by * 2 + qsy) * h1;
			const dx1 = dx + (i % 2) * w1;
			const dy1 = dy + Math.floor(i / 2) * h1;
			layer.addRect(0, sx1, sy1, dx1, dy1, w1, h1, ax, ay);
		}
	};
	
	//=============================================================================
	// Tilemap.Layer
	//=============================================================================
	
	Tilemap.Layer.ULTRA_MODE_7_VERTEX_STRIDE = Tilemap.Layer.VERTEX_STRIDE + 2 * UltraMode7.FLOAT_SIZE;
	
	const UltraMode7_Tilemap_Layer_prototype_initialize = Tilemap.Layer.prototype.initialize;
	Tilemap.Layer.prototype.initialize = function()
	{
		this._animationFrame = 0;
		this._allIndexBuffers = [];
		this._allIndexArrays = [];
		this._allVertexBuffers = [];
		this._allVertexArrays = [];
		this._allVaos = [];
		this._allElements = [];
		UltraMode7_Tilemap_Layer_prototype_initialize.call(this);
	};

	const UltraMode7_Tilemap_Layer_prototype_destroy = Tilemap.Layer.prototype.destroy;
	Tilemap.Layer.prototype.destroy = function()
	{
		for (var i = 0; i < this._allVaos.length; ++i)
		{
			this._allVaos[i].destroy();
			this._allIndexBuffers[i].destroy();
			this._allVertexBuffers[i].destroy();
		}
		this._vao = null;
		UltraMode7_Tilemap_Layer_prototype_destroy.call(this);
		this._allVaos.length = 0;
		this._allIndexBuffers.length = 0;
		this._allIndexArrays.length = 0;
		this._allVertexBuffers.length = 0;
		this._allVertexArrays.length = 0;
	};
	
	Tilemap.Layer.prototype.setAnimationFrame = function(value)
	{
		this._animationFrame = value;
	};

	const UltraMode7_Tilemap_Layer_prototype_addRect = Tilemap.Layer.prototype.addRect;
	Tilemap.Layer.prototype.addRect = function(setNumber, sx, sy, dx, dy, w, h, ax, ay)
	{
		if (!UltraMode7.isActive())
		{
			UltraMode7_Tilemap_Layer_prototype_addRect.call(this, setNumber, sx, sy, dx, dy, w, h);
			return;
		}
		ax = (ax !== undefined ? ax : 0);
		ay = (ay !== undefined ? ay : 0);
		if (this._allElements.length === 0 || this._allElements[this._allElements.length - 1].length >= UltraMode7.WEBGL_MAX_VERTICES / 4)
		{
			this._allElements.push([]);
		}
		this._allElements[this._allElements.length - 1].push([setNumber, sx, sy, dx, dy, w, h, ax, ay]);
	};
	
	const UltraMode7_Tilemap_Layer_prototype_render = Tilemap.Layer.prototype.render;
	Tilemap.Layer.prototype.render = function(renderer)
	{
		if (!UltraMode7.isActive())
		{
			UltraMode7_Tilemap_Layer_prototype_render.call(this, renderer);
			return;
		}
		// nothing to render
		if (this._allElements.length === 0 || this._allElements[0].length === 0)
		{
			return;
		}
		// prepare enough VAOs
		for (var i = this._allVaos.length; i < this._allElements.length; ++i)
		{
			this._createVao();
		}
		// renderer setup
		const gl = renderer.gl;
		const tilemapRenderer = renderer.plugins.um7tilemap;
		const shader = tilemapRenderer.getShader();
		shader.uniforms.uMode7ProjectionMatrix = $gameMap.ultraMode7ProjectionMatrix.data;
		shader.uniforms.uMode7ModelviewMatrix = $gameMap.ultraMode7ModelviewMatrix.data;
		shader.uniforms.uFadeBegin = $gameMap.ultraMode7FadeBegin;
		shader.uniforms.uFadeRange = $gameMap.ultraMode7FadeEnd - $gameMap.ultraMode7FadeBegin;
		shader.uniforms.animationFrame = new Float32Array([[0, 1, 2, 1][this._animationFrame % 4], this._animationFrame % 3]);
		shader.uniforms.uFadeColor = $gameMap.ultraMode7FadeColor;
		renderer.batch.setObjectRenderer(tilemapRenderer);
		renderer.shader.bind(shader);
		if (this._needsTexturesUpdate)
		{
			tilemapRenderer.updateTextures(renderer, this._images);
			this._needsTexturesUpdate = false;
		}
		tilemapRenderer.bindTextures(renderer);
		// render the segments
		for (var i = 0; i < this._allElements.length; ++i)
		{
			this._elements = this._allElements[i];
			this._indexBuffer = this._allIndexBuffers[i];
			this._indexArray = this._allIndexArrays[i];
			this._vertexBuffer = this._allVertexBuffers[i];
			this._vertexArray = this._allVertexArrays[i];
			this._vao = this._allVaos[i];
			renderer.geometry.bind(this._vao, shader);
			this._updateIndexBuffer();
			this._allIndexArrays[i] = this._indexArray;
			if (this._needsVertexUpdate)
			{
				this._updateVertexBuffer();
				this._allVertexArrays[i] = this._vertexArray;
			}
			renderer.geometry.updateBuffers();
			const numElements = this._elements.length;
			if (numElements > 0)
			{
				renderer.state.set(this._state);
				renderer.geometry.draw(gl.TRIANGLES, numElements * 6, 0);
			}
			this._allIndexBuffers[i] = this._indexBuffer;
			this._allIndexArrays[i] = this._indexArray;
			this._allVertexBuffers[i] = this._vertexBuffer;
			this._allVertexArrays[i] = this._vertexArray;
			this._allVaos[i] = this._vao;
		}
		this._needsVertexUpdate = false;
	};
	
	const UltraMode7_Tilemap_Layer_prototype__createVao = Tilemap.Layer.prototype._createVao;
	Tilemap.Layer.prototype._createVao = function()
	{
		if (!UltraMode7.isActive())
		{
			UltraMode7_Tilemap_Layer_prototype__createVao.call(this);
			return;
		}
		const type = PIXI.TYPES.FLOAT;
		const stride = Tilemap.Layer.ULTRA_MODE_7_VERTEX_STRIDE;
		const size = UltraMode7.FLOAT_SIZE;
		const indexBuffer = new PIXI.Buffer(null, true, true);
		const vertexBuffer = new PIXI.Buffer(null, true, false);
		const geometry = new PIXI.Geometry();
		const vao = geometry
			.addIndex(indexBuffer)
			.addAttribute("aTextureId", vertexBuffer, 1, false, type, stride, 0)
			.addAttribute("aFrame", vertexBuffer, 4, false, type, stride, 1 * size)
			.addAttribute("aTextureCoord", vertexBuffer, 2, false, type, stride, 5 * size)
			.addAttribute("aVertexPosition", vertexBuffer, 2, false, type, stride, 7 * size)
			.addAttribute("aAnimation", vertexBuffer, 2, false, type, stride, 9 * size);
		this._allIndexBuffers.push(indexBuffer);
		this._allIndexArrays.push(new Float32Array(0));
		this._allVertexBuffers.push(vertexBuffer);
		this._allVertexArrays.push(new Float32Array(0));
		this._allVaos.push(vao);
	};
	
	const UltraMode7_Tilemap_Layer_prototype__updateVertexBuffer = Tilemap.Layer.prototype._updateVertexBuffer;
	Tilemap.Layer.prototype._updateVertexBuffer = function()
	{
		if (!UltraMode7.isActive())
		{
			UltraMode7_Tilemap_Layer_prototype__updateVertexBuffer.call(this);
			return;
		}
		const numElements = this._elements.length;
		const required = numElements * Tilemap.Layer.ULTRA_MODE_7_VERTEX_STRIDE;
		if (this._vertexArray.length < required)
		{
			this._vertexArray = new Float32Array(required * 2);
		}
		var index = 0;
		const data = this._vertexArray;
		const eps = 0.5;
		for (var i = 0; i < numElements; ++i)
		{
			const item = this._elements[i];
			const setNumber = item[0];
			const tid = setNumber >> 2;
			const sxOffset = 1024 * (setNumber & 1);
			const syOffset = 1024 * ((setNumber >> 1) & 1);
			const sx = item[1] + sxOffset;
			const sy = item[2] + syOffset;
			const dx = item[3];
			const dy = item[4];
			const w = item[5];
			const h = item[6];
			const ax = item[7];
			const ay = item[8];
			const frameLeft = sx + eps;
			const frameTop = sy + eps;
			const frameRight = sx + w - eps;
			const frameBottom = sy + h - eps;
			data[index++] = tid;
			data[index++] = frameLeft;
			data[index++] = frameTop;
			data[index++] = frameRight;
			data[index++] = frameBottom;
			data[index++] = sx;
			data[index++] = sy;
			data[index++] = dx;
			data[index++] = dy;
			data[index++] = ax;
			data[index++] = ay;
			data[index++] = tid;
			data[index++] = frameLeft;
			data[index++] = frameTop;
			data[index++] = frameRight;
			data[index++] = frameBottom;
			data[index++] = sx + w;
			data[index++] = sy;
			data[index++] = dx + w;
			data[index++] = dy;
			data[index++] = ax;
			data[index++] = ay;
			data[index++] = tid;
			data[index++] = frameLeft;
			data[index++] = frameTop;
			data[index++] = frameRight;
			data[index++] = frameBottom;
			data[index++] = sx + w;
			data[index++] = sy + h;
			data[index++] = dx + w;
			data[index++] = dy + h;
			data[index++] = ax;
			data[index++] = ay;
			data[index++] = tid;
			data[index++] = frameLeft;
			data[index++] = frameTop;
			data[index++] = frameRight;
			data[index++] = frameBottom;
			data[index++] = sx;
			data[index++] = sy + h;
			data[index++] = dx;
			data[index++] = dy + h;
			data[index++] = ax;
			data[index++] = ay;
		}
		this._vertexBuffer.update(data);
	};
	
	//=============================================================================
	// Tilemap.CombinedLayer
	//=============================================================================
	
	// compatibility for RMMZ Core v1.7.0 and later
	if (!!Tilemap.CombinedLayer)
	{
		Tilemap.CombinedLayer.prototype.setAnimationFrame = function(value)
		{
			for (const child of this.children)
			{
				if (!!child.setAnimationFrame)
				{
					child.setAnimationFrame(value);
				}
			}
		};
		
		const UltraMode7_Tilemap_CombinedLayer_prototype_addRect = Tilemap.CombinedLayer.prototype.addRect;
		Tilemap.CombinedLayer.prototype.addRect = function(setNumber, sx, sy, dx, dy, w, h, ax, ay)
		{
			if (!UltraMode7.isActive())
			{
				UltraMode7_Tilemap_CombinedLayer_prototype_addRect.call(this, setNumber, sx, sy, dx, dy, w, h);
				return;
			}
			for (const child of this.children)
			{
				if (child.size() < Tilemap.Layer.MAX_SIZE)
				{
					child.addRect(setNumber, sx, sy, dx, dy, w, h, ax, ay);
					break;
				}
			}
		};
	
	}
	
	//=============================================================================
	// UltraMode7.TilemapRenderer
	//=============================================================================
	
	UltraMode7.TilemapRenderer = function()
	{
		this.initialize(...arguments);
	};

	UltraMode7.TilemapRenderer.prototype = Object.create(Tilemap.Renderer.prototype);
	UltraMode7.TilemapRenderer.prototype.constructor = UltraMode7.TilemapRenderer;
	
	UltraMode7.TilemapRenderer.prototype._createShader = function()
	{
		const fragmentSource = UltraMode7.generateFragmentShader(Tilemap.ULTRA_MODE_7_FRAGMENT_SHADER, Tilemap.Layer.MAX_GL_TEXTURES);
		const textureSize = 1 / UltraMode7.RMMZ_TEXTURE_SIZE;
		const uniforms = {
			uMode7ProjectionMatrix: new PIXI.Matrix(),
			uMode7ModelviewMatrix: new PIXI.Matrix(),
			uFadeBegin: 0.0,
			uFadeRange: 0.0,
			animationFrame: new Float32Array([0.0, 0.0]),
			shadowColor: new Float32Array([0.0, 0.0, 0.0, 0.5]),
			uFadeColor: new Float32Array([1.0, 1.0, 1.0])
		};
		uniforms["uSamplers"] = [];
		uniforms["uSamplerSize"] = [];
		for (var i = 0; i < Tilemap.Layer.MAX_GL_TEXTURES; ++i)
		{
			uniforms["uSamplers"].push(i);
			uniforms["uSamplerSize"].push(textureSize);
			uniforms["uSamplerSize"].push(textureSize);
		}
		return new PIXI.Shader(PIXI.Program.from(Tilemap.ULTRA_MODE_7_VERTEX_SHADER, fragmentSource), uniforms);
	};
	
	UltraMode7.TilemapRenderer.prototype._createInternalTextures = function()
	{
		Tilemap.Renderer.prototype._createInternalTextures.call(this);
		this._updateTextureScaleMode(false);
	};
	
	UltraMode7.TilemapRenderer.prototype.bindTextures = function(renderer)
	{
		this._updateTextureScaleMode(true);
		Tilemap.Renderer.prototype.bindTextures.call(this, renderer);
	};
	
	UltraMode7.TilemapRenderer.prototype._updateTextureScaleMode = function(requireUpdate)
	{
		const scaleMode = (UltraMode7.TILEMAP_PIXELATED ? PIXI.SCALE_MODES.NEAREST : PIXI.SCALE_MODES.LINEAR);
		for (var i = 0; i < this._internalTextures.length; ++i)
		{
			if (this._internalTextures[i].scaleMode !== scaleMode)
			{
				this._internalTextures[i].setStyle(scaleMode);
				if (requireUpdate)
				{
					this._internalTextures[i].update();
				}
			}
		}
	};
	
	PIXI.Renderer.registerPlugin("um7tilemap", UltraMode7.TilemapRenderer);

}
//=============================================================================
// Special code for RMMV
//=============================================================================
else if (UltraMode7.IS_RMMV)
{
	//=============================================================================
	// Shader
	//=============================================================================

	UltraMode7.Shader = (function(_super)
	{
		__extends(Shader, _super);
		
		function Shader(gl, maxTextures)
		{
			const fragmentSource = UltraMode7.generateFragmentShader(Tilemap.ULTRA_MODE_7_FRAGMENT_SHADER, maxTextures);
			const _this = _super.call(this, gl, maxTextures, Tilemap.ULTRA_MODE_7_VERTEX_SHADER, fragmentSource) || this;
			_this.vertSize = 11;
			_this.vertPerQuad = 4;
			_this.stride = _this.vertSize * UltraMode7.FLOAT_SIZE;
			PIXI.tilemap.shaderGenerator.fillSamplers(_this, maxTextures);
			return _this;
		};
		
		Shader.prototype.createVao = function(renderer, vb)
		{
			const gl = renderer.gl;
			const size = UltraMode7.FLOAT_SIZE;
			this.uniforms.uMode7ProjectionMatrix = $gameMap.ultraMode7ProjectionMatrix.data;
			this.uniforms.uMode7ModelviewMatrix = $gameMap.ultraMode7ModelviewMatrix.data;
			this.uniforms.uFadeBegin = UltraMode7.FADE_Z_BEGIN;
			this.uniforms.uFadeRange = UltraMode7.FADE_Z_END - UltraMode7.FADE_Z_BEGIN;
			this.uniforms.uFadeColor = [1.0, 1.0, 1.0];
			return renderer.createVao()
				.addIndex(this.indexBuffer)
				.addAttribute(vb, this.attributes.aTextureId, gl.FLOAT, false, this.stride, 0)
				.addAttribute(vb, this.attributes.aFrame, gl.FLOAT, false, this.stride, 1 * size)
				.addAttribute(vb, this.attributes.aTextureCoord, gl.FLOAT, false, this.stride, 5 * size)
				.addAttribute(vb, this.attributes.aVertexPosition, gl.FLOAT, false, this.stride, 7 * size)
				.addAttribute(vb, this.attributes.aAnimation, gl.FLOAT, false, this.stride, 9 * size)
		};
		
		return Shader;
		
	}(PIXI.tilemap.TilemapShader));

	//=============================================================================
	// PIXI.tilemap.TileRenderer
	//=============================================================================

	if (UltraMode7.TILEMAP_PIXELATED)
	{
		PIXI.tilemap.TileRenderer.SCALE_MODE = PIXI.SCALE_MODES.NEAREST;
	}
	else
	{
		PIXI.tilemap.TileRenderer.SCALE_MODE = PIXI.SCALE_MODES.LINEAR;
	}

	const UltraMode7_PIXI_tilemap_TileRenderer_prototype_onContextChange = PIXI.tilemap.TileRenderer.prototype.onContextChange;
	PIXI.tilemap.TileRenderer.prototype.onContextChange = function()
	{
		UltraMode7_PIXI_tilemap_TileRenderer_prototype_onContextChange.call(this);
		var maxTextures = this.maxTextures;
		if (UltraMode7.NEWER_PIXI_TILEMAP)
		{
			maxTextures = PIXI.tilemap.Constant.maxTextures;
		}
		this._ultraMode7Shader = new UltraMode7.Shader(this.renderer.gl, maxTextures);
		this._ultraMode7Shader.indexBuffer = this.indexBuffer;
	};

	const UltraMode7_PIXI_tilemap_TileRenderer_prototype_bindTextures = PIXI.tilemap.TileRenderer.prototype.bindTextures;
	PIXI.tilemap.TileRenderer.prototype.bindTextures = function(renderer, shader, textures)
	{
		UltraMode7_PIXI_tilemap_TileRenderer_prototype_bindTextures.call(this, renderer, shader, textures);
		if (!UltraMode7.isActive())
		{
			return;
		}
		var maxTextures = this.maxTextures;
		if (UltraMode7.NEWER_PIXI_TILEMAP)
		{
			maxTextures = PIXI.tilemap.Constant.maxTextures;
		}
		if (textures.length > 4 * maxTextures)
		{
			return;
		}
		for (var i = 0; i < textures.length; ++i)
		{
			const texture = textures[i];
			if (texture && texture.valid && texture.baseTexture.scaleMode !== PIXI.tilemap.TileRenderer.SCALE_MODE)
			{
				texture.baseTexture.scaleMode = PIXI.tilemap.TileRenderer.SCALE_MODE;
				const glTexture = this.glTextures[i >> 2];
				if (glTexture && glTexture.baseTexture.hasLoaded && glTexture.baseTexture._glTextures[renderer.CONTEXT_UID])
				{
					if (PIXI.tilemap.TileRenderer.SCALE_MODE === PIXI.SCALE_MODES.NEAREST)
					{
						glTexture.baseTexture._glTextures[renderer.CONTEXT_UID].enableNearestScaling();
					}
					else
					{
						glTexture.baseTexture._glTextures[renderer.CONTEXT_UID].enableLinearScaling();
					}
				}
			}
		}
	}

	const UltraMode7_PIXI_tilemap_TileRenderer_prototype_destroy = PIXI.tilemap.TileRenderer.prototype.destroy;
	PIXI.tilemap.TileRenderer.prototype.destroy = function()
	{
		UltraMode7_PIXI_tilemap_TileRenderer_prototype_destroy.call(this);
		this._ultraMode7Shader.destroy();
		this._ultraMode7Shader = null;
	};

	const UltraMode7_PIXI_tilemap_TileRenderer_prototype_getShader = PIXI.tilemap.TileRenderer.prototype.getShader;
	PIXI.tilemap.TileRenderer.prototype.getShader = function(useSquare)
	{
		if (!UltraMode7.isActive())
		{
			return UltraMode7_PIXI_tilemap_TileRenderer_prototype_getShader.call(this, useSquare);
		}
		return this._ultraMode7Shader;
	};

	if (!UltraMode7.NEWER_PIXI_TILEMAP)
	{
		// this fixes a bug in PIXI regarding an incorrectly named variable
		const UltraMode7_PIXI_tilemap_TileRenderer_prototype_getVb = PIXI.tilemap.TileRenderer.prototype.getVb;
		PIXI.tilemap.TileRenderer.prototype.getVb = function(id)
		{
			const vb = UltraMode7_PIXI_tilemap_TileRenderer_prototype_getVb.call(this, id);
			if (vb && vb.lastAccessTime)
			{
				vb.lastTimeAccess = vb.lastAccessTime;
				delete vb.lastAccessTime;
			}
			return vb;
		};
	}

	//=============================================================================
	// PIXI.tilemap.RectTileLayer
	//=============================================================================

	if (!UltraMode7.NEWER_PIXI_TILEMAP)
	{
		const UltraMode7_PIXI_tilemap_RectTileLayer_prototype_renderWebGL = PIXI.tilemap.RectTileLayer.prototype.renderWebGL;
		PIXI.tilemap.RectTileLayer.prototype.renderWebGL = function(renderer, useSquare)
		{
			if (!UltraMode7.isActive())
			{
				UltraMode7_PIXI_tilemap_RectTileLayer_prototype_renderWebGL.call(this, renderer, useSquare);
				return;
			}
			this.ultraMode7Render(renderer, renderer.plugins.tilemap);
		};
	}
	else
	{
		const UltraMode7_PIXI_tilemap_RectTileLayer_prototype_renderWebGLCore = PIXI.tilemap.RectTileLayer.prototype.renderWebGLCore;
		PIXI.tilemap.RectTileLayer.prototype.renderWebGLCore = function(renderer, plugin)
		{
			if (!UltraMode7.isActive())
			{
				UltraMode7_PIXI_tilemap_RectTileLayer_prototype_renderWebGLCore.call(this, renderer, plugin);
				return;
			}
			this.ultraMode7Render(renderer, (plugin || renderer.plugins.tilemap));
		};
		
		PIXI.tilemap.RectTileLayer.prototype.getUltraMode7Vb = function(renderer, vbId)
		{
			if (this.vbs)
			{
				const _vb = this.vbs[vbId];
				if (_vb)
				{
					if (_vb.rendererSN === renderer.sn)
					{
						return _vb;
					}
					const otherVb = this.vb;
					this.vb = _vb;
					UltraMode7_PIXI_tilemap_RectTileLayer_prototype_destroyVb.call(this);
					this.vb = otherVb;
				}
			}
			return null;
		};

		const UltraMode7_PIXI_tilemap_RectTileLayer_prototype_destroyVb = PIXI.tilemap.RectTileLayer.prototype.destroyVb;
		PIXI.tilemap.RectTileLayer.prototype.destroyVb = function()
		{
			UltraMode7_PIXI_tilemap_RectTileLayer_prototype_destroyVb.call(this);
			if (this.vbs)
			{
				for (var id in this.vbs)
				{
					this.vb = this.vbs[id];
					UltraMode7_PIXI_tilemap_RectTileLayer_prototype_destroyVb.call(this);
				}
				this.vbs = null;
			}
		};
		
	}

	PIXI.tilemap.RectTileLayer.prototype.ultraMode7Render = function(renderer, tile)
	{
		const points = this.pointsBuf;
		if (points.length === 0)
		{
			return;
		}
		const shader = tile.getShader();
		const textures = this.textures;
		if (textures.length === 0)
		{
			return;
		}
		const quadsCount = points.length / 9;
		if (quadsCount === 0)
		{
			return;
		}
		const gl = renderer.gl;
		const length = textures.length;
		for (var i = 0; i < length; ++i)
		{
			if (!textures[i] || !textures[i].valid)
			{
				return;
			}
			const texture = textures[i].baseTexture;
		}
		if (!this.vbIds)
		{
			this.vbIds = [];
			this.vbBuffers = [];
			this.modificationMarkers = [];
			this.vbArrays = [];
		}
		tile.checkIndexBuffer(quadsCount);
		tile.bindTextures(renderer, shader, textures);
		shader.uniforms.uMode7ProjectionMatrix = $gameMap.ultraMode7ProjectionMatrix.data;
		shader.uniforms.uMode7ModelviewMatrix = $gameMap.ultraMode7ModelviewMatrix.data;
		shader.uniforms.uFadeBegin = $gameMap.ultraMode7FadeBegin;
		shader.uniforms.uFadeRange = $gameMap.ultraMode7FadeEnd - $gameMap.ultraMode7FadeBegin;
		shader.uniforms.uFadeColor = $gameMap.ultraMode7FadeColor;
		const maxQuads = UltraMode7.WEBGL_MAX_VERTICES / shader.vertPerQuad;
		const maxLoops = Math.floor((quadsCount + maxQuads - 1) / maxQuads);
		for (var j = 0; j < maxLoops; ++j)
		{
			if (!this.vbIds[j])
			{
				this.vbIds[j] = 0;
				this.vbBuffers[j] = null;
				this.modificationMarkers[j] = 0;
				this.vbArrays[j] = null;
			}
			const currentRectsCount = Math.min(maxQuads, quadsCount - j * maxQuads);
			var vb = null;
			if (!UltraMode7.NEWER_PIXI_TILEMAP)
			{
				vb = tile.getVb(this.vbIds[j]);
			}
			else
			{
				if (!this.vbs)
				{
					this.vbs = {};
				}
				vb = this.getUltraMode7Vb(tile, this.vbIds[j]);
			}
			if (!vb)
			{
				if (!UltraMode7.NEWER_PIXI_TILEMAP)
				{
					vb = tile.createVb(false);
				}
				else
				{
					vb = tile.createVb();
					this.vbs[vb.id] = vb;
				}
				this.vbIds[j] = vb.id;
				this.vbBuffers[j] = null;
				this.modificationMarkers[j] = 0;
				this.vbArrays[j] = null;
			}
			const vao = vb.vao;
			renderer.bindVao(vao);
			const vertexBuf = vb.vb;
			vertexBuf.bind();
			const currentVertices = currentRectsCount * shader.vertPerQuad;
			if (this.modificationMarkers[j] !== currentVertices)
			{
				this.modificationMarkers[j] = currentVertices;
				const vs = shader.stride * currentVertices;
				if (!this.vbBuffers[j] || this.vbBuffers[j].byteLength < vs)
				{
					var bk = shader.stride;
					while (bk < vs)
					{
						bk *= 2;
					}
					this.vbBuffers[j] = new ArrayBuffer(bk);
					this.vbArrays[j] = new Float32Array(this.vbBuffers[j]);
					vertexBuf.upload(this.vbBuffers[j], 0, true);
				}
				const data = this.vbArrays[j];
				var index = 0;
				const eps = 0.5;
				for (i = j * maxQuads * 9; i < points.length && i < (j + 1) * maxQuads * 9; i += 9)
				{
					const x = points[i + 2];
					const y = points[i + 3];
					const w = points[i + 4];
					const h = points[i + 5];
					const u = points[i] + 1024 * (points[i + 8] & 1);
					const v = points[i + 1] + 1024 * ((points[i + 8] >> 1) & 1);
					const animX = points[i + 6];
					const animY = points[i + 7];
					const textureId = (points[i + 8] >> 2);
					data[index++] = textureId;
					data[index++] = u + eps;
					data[index++] = v + eps;
					data[index++] = u + w - eps;
					data[index++] = v + h - eps;
					data[index++] = u;
					data[index++] = v;
					data[index++] = x;
					data[index++] = y;
					data[index++] = animX;
					data[index++] = animY;
					data[index++] = textureId;
					data[index++] = u + eps;
					data[index++] = v + eps;
					data[index++] = u + w - eps;
					data[index++] = v + h - eps;
					data[index++] = u + w;
					data[index++] = v;
					data[index++] = x + w;
					data[index++] = y;
					data[index++] = animX;
					data[index++] = animY;
					data[index++] = textureId;
					data[index++] = u + eps;
					data[index++] = v + eps;
					data[index++] = u + w - eps;
					data[index++] = v + h - eps;
					data[index++] = u + w;
					data[index++] = v + h;
					data[index++] = x + w;
					data[index++] = y + h;
					data[index++] = animX;
					data[index++] = animY;
					data[index++] = textureId;
					data[index++] = u + eps;
					data[index++] = v + eps;
					data[index++] = u + w - eps;
					data[index++] = v + h - eps;
					data[index++] = u;
					data[index++] = v + h;
					data[index++] = x;
					data[index++] = y + h;
					data[index++] = animX;
					data[index++] = animY;
				}
				vertexBuf.upload(data, 0, true);
			}
			gl.drawElements(gl.TRIANGLES, currentRectsCount * 6, gl.UNSIGNED_SHORT, 0);
		}
	};
	
	//=============================================================================
	// ShaderTilemap
	//=============================================================================

	const UltraMode7_ShaderTilemap_prototype_updateTransform = ShaderTilemap.prototype.updateTransform;
	ShaderTilemap.prototype.updateTransform = function()
	{
		if (!UltraMode7.isActive())
		{
			UltraMode7_ShaderTilemap_prototype_updateTransform.call(this);
			return;
		}
		const startX = Math.floor(-this._makeMarginX() / this.tileWidth);
		const startY = Math.floor(-this._makeMarginY() / this.tileHeight);
		if (this._needsRepaint || this._lastStartX !== startX || this._lastStartY !== startY)
		{
			this._lastStartX = startX;
			this._lastStartY = startY;
			this._paintAllTiles(startX, startY);
			this._needsRepaint = false;
		}
		this._sortChildren();
		PIXI.Container.prototype.updateTransform.call(this);
	};

	const UltraMode7_ShaderTilemap_prototype__createLayers = ShaderTilemap.prototype._createLayers;
	ShaderTilemap.prototype._createLayers = function()
	{
		if (!UltraMode7.isActive())
		{
			UltraMode7_ShaderTilemap_prototype__createLayers.call(this);
			return;
		}
		// width/height forcing is needed, because some scripts manipulate the width and height values of the tilemap
		this._width = $gameMap.width() * $gameMap.tileWidth();
		this._height = $gameMap.height() * $gameMap.tileHeight();
		if ($gameMap.isLoopHorizontal())
		{
			this._width += Graphics.width;
		}
		if ($gameMap.isLoopVertical())
		{
			this._height += Graphics.height;
		}
		const width = this._width;
		const height = this._height;
		const tileCols = Math.ceil(width / this.tileWidth) + 1;
		const tileRows = Math.ceil(height / this.tileHeight) + 1;
		this._layerWidth = tileCols * this.tileWidth;
		this._layerHeight = tileRows * this.tileHeight;
		this._needsRepaint = true;
		if (!this.lowerZLayer)
		{
			this.lowerZLayer = new PIXI.tilemap.ZLayer(this, 0);
			this.upperZLayer = new PIXI.tilemap.ZLayer(this, 0);
			this.addChild(this.lowerZLayer);
			this.addChild(this.upperZLayer);
			const parameters = PluginManager.parameters('ShaderTilemap');
			const useSquareShader = Number(parameters.hasOwnProperty('squareShader') ? parameters['squareShader'] : 0);
			this.lowerLayer = new PIXI.tilemap.CompositeRectTileLayer(0, [], useSquareShader);
			this.lowerLayer.shadowColor = new Float32Array([0.0, 0.0, 0.0, 0.5]);
			this.lowerZLayer.addChild(this.lowerLayer);
			this.upperLayer = new PIXI.tilemap.CompositeRectTileLayer(0, [], useSquareShader);
			this.upperZLayer.addChild(this.upperLayer);
		}
	};

	const UltraMode7_ShaderTilemap_prototype__paintAllTiles = ShaderTilemap.prototype._paintAllTiles;
	ShaderTilemap.prototype._paintAllTiles = function(startX, startY)
	{
		if (!UltraMode7.isActive())
		{
			UltraMode7_ShaderTilemap_prototype__paintAllTiles.call(this, startX, startY);
			return;
		}
		this.lowerZLayer.clear();
		this.upperZLayer.clear();
		const tileCols = Math.ceil(this._width / this.tileWidth);
		const tileRows = Math.ceil(this._height / this.tileHeight);
		for (var y = startY; y < tileRows - startY; ++y)
		{
			for (var x = startX; x < tileCols - startX; ++x)
			{
				this._paintTiles(0, 0, x, y);
			}
		}
	};
}

//=============================================================================
// Game_Map
//=============================================================================

Object.defineProperties(Game_Map.prototype,
{
	useUltraMode7: { get: function() { return this._useUltraMode7; }, configurable: true },
	ultraMode7Fov: { get: function() { return this._ultraMode7Fov; }, configurable: true },
	ultraMode7Pitch: { get: function() { return this._ultraMode7Pitch; }, configurable: true },
	ultraMode7Yaw: { get: function() { return this._ultraMode7Yaw; }, configurable: true },
	ultraMode7Roll: { get: function() { return this._ultraMode7Roll; }, configurable: true },
	ultraMode7CameraDistance: { get: function() { return this._ultraMode7CameraDistance; }, configurable: true },
	ultraMode7CameraY: { get: function() { return this._ultraMode7CameraY; }, configurable: true },
	ultraMode7NearClipZ: { get: function() { return this._ultraMode7NearClipZ; }, configurable: true },
	ultraMode7FarClipZ: { get: function() { return this._ultraMode7FarClipZ; }, configurable: true },
	ultraMode7FadeColor: { get: function() { return this._ultraMode7FadeColor; }, configurable: true },
	ultraMode7FadeBegin: { get: function() { return this._ultraMode7FadeBegin; }, configurable: true },
	ultraMode7FadeEnd: { get: function() { return this._ultraMode7FadeEnd; }, configurable: true },
	ultraMode7ParallaxDistance: { get: function() { return this._ultraMode7ParallaxDistance; }, configurable: true },
	ultraMode7LoopMapsExtendX: { get: function() { return this._ultraMode7LoopMapsExtendX; }, configurable: true },
	ultraMode7LoopMapsExtendY: { get: function() { return this._ultraMode7LoopMapsExtendY; }, configurable: true },
	ultraMode7ProjectionMatrix: { get: function() { return this._ultraMode7ProjectionMatrix; }, configurable: true },
	ultraMode7ModelviewMatrix: { get: function() { return this._ultraMode7ModelviewMatrix; }, configurable: true }
});

const UltraMode7_Game_Map_prototype_initialize = Game_Map.prototype.initialize;
Game_Map.prototype.initialize = function()
{
	UltraMode7_Game_Map_prototype_initialize.call(this);
	this.initUltraMode7();
};

const UltraMode7_Game_Map_prototype_setup = Game_Map.prototype.setup;
Game_Map.prototype.setup = function(mapId)
{
	UltraMode7_Game_Map_prototype_setup.call(this, mapId);
	this.setupUltraMode7();
};

Game_Map.prototype.initUltraMode7 = function()
{
	this._useUltraMode7 = false;
	this._ultraMode7Pitch = 0;
	this._ultraMode7Yaw = 0;
	this._ultraMode7Roll = 0;
	this._ultraMode7CameraDistance = UltraMode7.DEFAULT_CAMERA_DISTANCE;
	this._ultraMode7CameraY = UltraMode7.DEFAULT_CAMERA_Y;
	this._ultraMode7NearClipZ = UltraMode7.DEFAULT_NEAR_CLIP_Z;
	this._ultraMode7FarClipZ = UltraMode7.DEFAULT_FAR_CLIP_Z;
	this._ultraMode7ParallaxDistance = UltraMode7.DEFAULT_PARALLAX_DISTANCE;
	this._ultraMode7FadeColor = UltraMode7.FADE_Z_COLOR.slice();
	this._ultraMode7FadeBegin = UltraMode7.FADE_Z_BEGIN;
	this._ultraMode7FadeEnd = UltraMode7.FADE_Z_END;
	this._ultraMode7LoopMapsExtendX = 0;
	this._ultraMode7LoopMapsExtendY = 0;
	this._ultraMode7LastLoopMapsExtendX = 0;
	this._ultraMode7LastLoopMapsExtendY = 0;
	this._ultraMode7BorderLeft = 0;
	this._ultraMode7BorderRight = 0;
	this._ultraMode7BorderTop = 0;
	this._ultraMode7BorderBottom = 0;
	this._ultraMode7ProjectionMatrix = new Matrix4();
	this._ultraMode7ModelviewMatrix = new Matrix4();
	const eye = new Vector3(0, 0, this._ultraMode7CameraDistance);
	const target = new Vector3(0, 0, 0);
	const up = new Vector3(0, 1, 0);
	this._ultraMode7ModelviewMatrix.lookAt(eye, target, up);
};

Game_Map.prototype.setupUltraMode7 = function()
{
	this.initUltraMode7();
	if (!$dataMap)
	{
		throw new Error("The map data is not available");
	}
	if ($dataMap.meta && ($dataMap.meta.UltraMode7 || $dataMap.meta.UltraMode7_FOV || $dataMap.meta.UltraMode7_Pitch ||
		$dataMap.meta.UltraMode7_Yaw || $dataMap.meta.UltraMode7_Roll || $dataMap.meta.UltraMode7_CameraDistance ||
		$dataMap.meta.UltraMode7_CameraY || $dataMap.meta.UltraMode7_NearClipZ || $dataMap.meta.UltraMode7_FarClipZ ||
		$dataMap.meta.UltraMode7_FadeColor || $dataMap.meta.UltraMode7_ParallaxDistance))
	{
		this._useUltraMode7 = true;
		this._ultraMode7Fov = Math.max(BlizzardUtility.Numeric($dataMap.meta.UltraMode7_FOV, UltraMode7.DEFAULT_FOV), UltraMode7.MIN_FOV);
		this._ultraMode7Pitch = BlizzardUtility.Numeric($dataMap.meta.UltraMode7_Pitch, UltraMode7.DEFAULT_PITCH).clamp(UltraMode7.MIN_PITCH, UltraMode7.MAX_PITCH);
		this._ultraMode7Yaw = BlizzardUtility.Numeric($dataMap.meta.UltraMode7_Yaw, UltraMode7.DEFAULT_YAW);
		this._ultraMode7Roll = BlizzardUtility.Numeric($dataMap.meta.UltraMode7_Roll, UltraMode7.DEFAULT_ROLL);
		this._ultraMode7CameraDistance = Math.max(BlizzardUtility.Numeric($dataMap.meta.UltraMode7_CameraDistance, UltraMode7.DEFAULT_CAMERA_DISTANCE), 0);
		this._ultraMode7CameraY = BlizzardUtility.Numeric($dataMap.meta.UltraMode7_CameraY, UltraMode7.DEFAULT_CAMERA_Y);
		this._ultraMode7NearClipZ = Math.max(BlizzardUtility.Numeric($dataMap.meta.UltraMode7_NearClipZ, UltraMode7.DEFAULT_NEAR_CLIP_Z), 1);
		this._ultraMode7FarClipZ = Math.max(BlizzardUtility.Numeric($dataMap.meta.UltraMode7_FarClipZ, UltraMode7.DEFAULT_FAR_CLIP_Z), this._ultraMode7NearClipZ + 1);
		if ($dataMap.meta.UltraMode7_FadeColor)
		{
			this._ultraMode7FadeColor = UltraMode7.validateFadeColor(JSON.parse("[" + $dataMap.meta.UltraMode7_FadeColor + "]"));
		}
		else
		{
			this._ultraMode7FadeColor = UltraMode7.FADE_Z_COLOR.slice();
		}
		this._ultraMode7FadeBegin = Math.max(BlizzardUtility.Numeric($dataMap.meta.UltraMode7_FadeBegin, UltraMode7.FADE_Z_BEGIN), this._ultraMode7NearClipZ);
		this._ultraMode7FadeEnd = Math.max(Math.min(BlizzardUtility.Numeric($dataMap.meta.UltraMode7_FadeEnd, UltraMode7.FADE_Z_END), this._ultraMode7FarClipZ), this._ultraMode7FadeBegin);
		this._ultraMode7ParallaxDistance = Math.max(BlizzardUtility.Numeric($dataMap.meta.UltraMode7_ParallaxDistance, UltraMode7.DEFAULT_PARALLAX_DISTANCE), 1);
		this._ultraMode7LoopMapsExtendX = 0;
		this._ultraMode7LoopMapsExtendY = 0;
		this._ultraMode7LastLoopMapsExtendX = 0;
		this._ultraMode7LastLoopMapsExtendY = 0;
		// borders
		this._ultraMode7BorderLeft = 0;
		this._ultraMode7BorderRight = 0;
		this._ultraMode7BorderTop = 0;
		this._ultraMode7BorderBottom = 0;
		var border = 0;
		if ($dataMap.meta.UltraMode7_Border)
		{
			border = BlizzardUtility.Numeric($dataMap.meta.UltraMode7_Border, 0);
			this._ultraMode7BorderLeft = border;
			this._ultraMode7BorderRight = border;
			this._ultraMode7BorderTop = border;
			this._ultraMode7BorderBottom = border;
		}
		else
		{
			if ($dataMap.meta.UltraMode7_BorderHorizontal)
			{
				border = BlizzardUtility.Numeric($dataMap.meta.UltraMode7_BorderHorizontal, 0);
				this._ultraMode7BorderLeft = border;
				this._ultraMode7BorderRight = border;
			}
			else
			{
				this._ultraMode7BorderLeft = BlizzardUtility.Numeric($dataMap.meta.UltraMode7_BorderLeft, 0);
				this._ultraMode7BorderRight = BlizzardUtility.Numeric($dataMap.meta.UltraMode7_BorderRight, 0);
			}
			if ($dataMap.meta.UltraMode7_BorderVertical)
			{
				border = BlizzardUtility.Numeric($dataMap.meta.UltraMode7_BorderVertical, 0);
				this._ultraMode7BorderTop = border;
				this._ultraMode7BorderBottom = border;
			}
			else
			{
				this._ultraMode7BorderTop = BlizzardUtility.Numeric($dataMap.meta.UltraMode7_BorderTop, 0);
				this._ultraMode7BorderBottom = BlizzardUtility.Numeric($dataMap.meta.UltraMode7_BorderBottom, 0);
			}
		}
		this.refreshUltraMode7View();
	}
};

Game_Map.prototype.setUltraMode7Fov = function(value)
{
	if (!this._useUltraMode7)
	{
		return;
	}
	this._ultraMode7Fov = Math.max(value, UltraMode7.MIN_FOV); // more or less arbitrary limit, but there are huge issues with smaller values
	this.refreshUltraMode7View();
};

Game_Map.prototype.setUltraMode7Pitch = function(value)
{
	if (!this._useUltraMode7)
	{
		return;
	}
	this._ultraMode7Pitch = value.clamp(UltraMode7.MIN_PITCH, UltraMode7.MAX_PITCH);
	this.refreshUltraMode7View();
};

Game_Map.prototype.setUltraMode7Yaw = function(value)
{
	if (!this._useUltraMode7)
	{
		return;
	}
	this._ultraMode7Yaw = value;
	this.refreshUltraMode7View();
};

Game_Map.prototype.setUltraMode7Roll = function(value)
{
	if (!this._useUltraMode7)
	{
		return;
	}
	this._ultraMode7Roll = value;
	this.refreshUltraMode7View();
};

Game_Map.prototype.setUltraMode7CameraDistance = function(value)
{
	if (!this._useUltraMode7)
	{
		return;
	}
	this._ultraMode7CameraDistance = Math.max(value, 0);
	this.refreshUltraMode7View();
};

Game_Map.prototype.setUltraMode7CameraY = function(value)
{
	if (!this._useUltraMode7)
	{
		return;
	}
	this._ultraMode7CameraY = value;
	this.refreshUltraMode7View();
};

Game_Map.prototype.setUltraMode7NearClipY = function(value)
{
	if (!this._useUltraMode7)
	{
		return;
	}
	this._ultraMode7NearClipZ = value;
	this.refreshUltraMode7View();
};

Game_Map.prototype.setUltraMode7FarClipZ = function(value)
{
	if (!this._useUltraMode7)
	{
		return;
	}
	this._ultraMode7FarClipZ = value;
	this.refreshUltraMode7View();
};

Game_Map.prototype.setUltraMode7ParallaxDistance = function(value)
{
	if (!this._useUltraMode7)
	{
		return;
	}
	this._ultraMode7ParallaxDistance = Math.max(value, 1);
	this.refreshUltraMode7View();
};

Game_Map.prototype.setUltraMode7FadeColor = function(value)
{
	if (!this._useUltraMode7)
	{
		return;
	}
	this._ultraMode7FadeColor = UltraMode7.validateFadeColor(value);
	this.refreshUltraMode7View();
};

Game_Map.prototype.setUltraMode7FadeBegin = function(value)
{
	if (!this._useUltraMode7)
	{
		return;
	}
	this._ultraMode7FadeBegin = value;
	this.refreshUltraMode7View();
};

Game_Map.prototype.setUltraMode7FadeEnd = function(value)
{
	if (!this._useUltraMode7)
	{
		return;
	}
	this._ultraMode7FadeEnd = value;
	this.refreshUltraMode7View();
};

Game_Map.prototype.refreshUltraMode7View = function()
{
	if (!this._useUltraMode7)
	{
		return;
	}
	if (this.isLoopHorizontal() || this.isLoopVertical())
	{
		if (this._ultraMode7Fov < 180)
		{
			const halfFov = this._ultraMode7Fov * Math.PI / 360;
			const topVector = this._ultraMode7FarClipZ / Math.cos(halfFov);
			const maxVector = Math.abs(topVector / Math.cos(halfFov * Graphics.height / Graphics.width));
			const correctedVector = maxVector * this._ultraMode7CameraDistance / this._ultraMode7FarClipZ;
			var newExtendX = Math.ceil(correctedVector / this.tileWidth()) + 1; // +1, because the tile coordinate is centered in Mode7
			var newExtendY = Math.ceil(correctedVector / this.tileHeight()) + 1; // +1, because the tile coordinate is centered in Mode7
			if (UltraMode7.LOOP_MAPS_EXTEND_TILES_SMART)
			{
				if (this._ultraMode7LoopMapsExtendX === 0 || newExtendX - this._ultraMode7LoopMapsExtendX >= UltraMode7.LOOP_MAPS_EXTEND_TILES)
				{
					this._ultraMode7LoopMapsExtendX = newExtendX;
				}
				if (this._ultraMode7LoopMapsExtendY === 0 || newExtendY - this._ultraMode7LoopMapsExtendY >= UltraMode7.LOOP_MAPS_EXTEND_TILES)
				{
					this._ultraMode7LoopMapsExtendY = newExtendY;
				}
			}
			else
			{
				this._ultraMode7LoopMapsExtendX = newExtendX;
				this._ultraMode7LoopMapsExtendY = newExtendY;
			}
		}
	}
	else
	{
		this._ultraMode7LoopMapsExtendX = 0;
		this._ultraMode7LoopMapsExtendY = 0;
		this._ultraMode7LastLoopMapsExtendX = 0;
		this._ultraMode7LastLoopMapsExtendY = 0;
	}
	// setup the matrices
	if (this._ultraMode7Fov > 0)
	{
		this._ultraMode7ProjectionMatrix.setPerspective(this._ultraMode7Fov, Graphics.width, Graphics.height, this._ultraMode7NearClipZ, this._ultraMode7FarClipZ);
	}
	else
	{
		this._ultraMode7ProjectionMatrix.setOrthoProjection(0, 0, Graphics.width, Graphics.height);
	}
	const eye = new Vector3(0, 0, this._ultraMode7CameraDistance);
	const target = new Vector3(0, 0, 0);
	const up = new Vector3(0, 1, 0);
	this._ultraMode7ModelviewMatrix.lookAt(eye, target, up);
	this._ultraMode7ModelviewMatrix.translate($gameScreen.shake(), 0, 0);
	this._ultraMode7ModelviewMatrix.rotateX(this._ultraMode7Pitch);
	this._ultraMode7ModelviewMatrix.rotateY(this._ultraMode7Roll);
	this._ultraMode7ModelviewMatrix.rotateZ(this._ultraMode7Yaw);
	this._ultraMode7ModelviewMatrix.translate(-Graphics.width / 2 - this.displayX() * this.tileWidth(), -Graphics.height / 2 - (this.displayY() + 0.5) * this.tileHeight(), -this._ultraMode7CameraY);
};

Game_Map.prototype.adjustUltraMode7LoopedPosition = function(x, y)
{
	const halfWidth = Math.floor(Graphics.width / 2 / this.tileWidth());
	const halfHeight = Math.floor(Graphics.height / 2 / this.tileHeight());
	x -= this._displayX + halfWidth;
	y -= this._displayY + halfHeight;
	if (this.isLoopHorizontal())
	{
		const width = this.width();
		if (x < -width / 2)
		{
			x += width;
		}
		else if (x > width / 2)
		{
			x -= width;
		}
	}
	if (this.isLoopVertical())
	{
		const height = this.height();
		if (y < -height / 2)
		{
			y += height;
		}
		else if (y > height / 2)
		{
			y -= height;
		}
	}
	return {x: x + halfWidth, y: y + halfHeight};
};

const UltraMode7_Game_Map_prototype_parallaxOx = Game_Map.prototype.parallaxOx;
Game_Map.prototype.parallaxOx = function()
{
	if (!this._useUltraMode7)
	{
		return UltraMode7_Game_Map_prototype_parallaxOx.call(this);
	}
	const offset = -2 * UltraMode7.DEFAULT_PARALLAX_DISTANCE * Math.PI * this._ultraMode7Yaw / 360;
	if (this._parallaxZero)
	{
		return (this._parallaxX * UltraMode7.PARALLAX_SCROLL_X_MULTIPLIER * this.tileWidth() + offset);
	}
	if (this._parallaxLoopX)
	{
		return (this._parallaxX * UltraMode7.PARALLAX_SCROLL_X_MULTIPLIER * this.tileWidth() / 2 + offset);
	}
	return 0;
};

const UltraMode7_Game_Map_prototype_parallaxOy = Game_Map.prototype.parallaxOy;
Game_Map.prototype.parallaxOy = function()
{
	if (!this._useUltraMode7)
	{
		return UltraMode7_Game_Map_prototype_parallaxOy.call(this);
	}
	const offset = -2 * UltraMode7.DEFAULT_PARALLAX_DISTANCE * Math.PI * this._ultraMode7Pitch / 360;
	if (this._parallaxZero)
	{
		return (this._parallaxY * UltraMode7.PARALLAX_SCROLL_Y_MULTIPLIER * this.tileHeight() + offset);
	}
	if (this._parallaxLoopY)
	{
		return (this._parallaxY * UltraMode7.PARALLAX_SCROLL_Y_MULTIPLIER * this.tileHeight() / 2 + offset);
	}
	return 0;
};

Game_Map.prototype.clampUltraMode7DisplayX = function(x)
{
	const screenTileX = this.screenTileX();
	const left = -(screenTileX - 1) * 0.5 + this._ultraMode7BorderLeft;
	const right = this.width() - (screenTileX + 1) * 0.5 - this._ultraMode7BorderRight;
	const width = this.width() - (this._ultraMode7BorderLeft + this._ultraMode7BorderRight);
	return (width < 0 ? width / 2 : x.clamp(left, right));
};

Game_Map.prototype.clampUltraMode7DisplayY = function(y)
{
	const screenTileY = this.screenTileY();
	const top = -(screenTileY - 1) * 0.5 + this._ultraMode7BorderTop;
	const bottom = this.height() -(screenTileY + 1) * 0.5 - this._ultraMode7BorderBottom;
	const height = this.height() - (this._ultraMode7BorderTop + this._ultraMode7BorderBottom);
	return (height < 0 ? height / 2 : y.clamp(top, bottom));
};

const UltraMode7_Game_Map_prototype_setDisplayPos = Game_Map.prototype.setDisplayPos;
Game_Map.prototype.setDisplayPos = function(x, y)
{
	if (!this._useUltraMode7)
	{
		UltraMode7_Game_Map_prototype_setDisplayPos.call(this, x, y);
		return;
	}
	if (this.isLoopHorizontal())
	{
		this._displayX = x.mod(this.width());
		this._parallaxX = x;
	}
	else
	{
		this._displayX = this.clampUltraMode7DisplayX(x);
		this._parallaxX = this._displayX;
	}
	if (this.isLoopVertical())
	{
		this._displayY = y.mod(this.height());
		this._parallaxY = y;
	}
	else
	{
		this._displayY = this.clampUltraMode7DisplayY(y);
		this._parallaxY = this._displayY;
	}
	this.refreshUltraMode7View();
};

const UltraMode7_Game_Map_prototype_scrollDown = Game_Map.prototype.scrollDown;
Game_Map.prototype.scrollDown = function(distance)
{
	if (!this._useUltraMode7)
	{
		UltraMode7_Game_Map_prototype_scrollDown.call(this, distance);
		return;
	}
	if (this.isLoopVertical())
	{
		this._displayY = (this._displayY + distance) % $dataMap.height;
		if (this._parallaxLoopY)
		{
			this._parallaxY += distance;
		}
	}
	else
	{
		const lastY = this._displayY;
		this._displayY = this.clampUltraMode7DisplayY(this._displayY + distance);
		this._parallaxY += this._displayY - lastY;
	}
	this.refreshUltraMode7View();
};

const UltraMode7_Game_Map_prototype_scrollLeft = Game_Map.prototype.scrollLeft;
Game_Map.prototype.scrollLeft = function(distance)
{
	if (!this._useUltraMode7)
	{
		UltraMode7_Game_Map_prototype_scrollLeft.call(this, distance);
		return;
	}
	if (this.isLoopHorizontal())
	{
		this._displayX = (this._displayX + $dataMap.width - distance) % $dataMap.width;
		if (this._parallaxLoopX)
		{
			this._parallaxX -= distance;
		}
	}
	else
	{
		const lastX = this._displayX;
		this._displayX = this.clampUltraMode7DisplayX(this._displayX - distance);
		this._parallaxX += this._displayX - lastX;
	}
	this.refreshUltraMode7View();
};

const UltraMode7_Game_Map_prototype_scrollRight = Game_Map.prototype.scrollRight;
Game_Map.prototype.scrollRight = function(distance)
{
	if (!this._useUltraMode7)
	{
		UltraMode7_Game_Map_prototype_scrollRight.call(this, distance);
		return;
	}
	if (this.isLoopHorizontal())
	{
		this._displayX = (this._displayX + distance) % $dataMap.width;
		if (this._parallaxLoopX)
		{
			this._parallaxX += distance;
		}
	}
	else
	{
		const lastX = this._displayX;
		this._displayX = this.clampUltraMode7DisplayX(this._displayX + distance);
		this._parallaxX += this._displayX - lastX;
	}
	this.refreshUltraMode7View();
};

const UltraMode7_Game_Map_prototype_scrollUp = Game_Map.prototype.scrollUp;
Game_Map.prototype.scrollUp = function(distance)
{
	if (!this._useUltraMode7)
	{
		UltraMode7_Game_Map_prototype_scrollUp.call(this, distance);
		return;
	}
	if (this.isLoopVertical())
	{
		this._displayY = (this._displayY + $dataMap.height - distance) % $dataMap.height;
		if (this._parallaxLoopY)
		{
			this._parallaxY -= distance;
		}
	}
	else
	{
		const lastY = this._displayY;
		this._displayY = this.clampUltraMode7DisplayY(this._displayY - distance);
		this._parallaxY += this._displayY - lastY;
	}
	this.refreshUltraMode7View();
};

const UltraMode7_Game_Map_prototype_update = Game_Map.prototype.update;
Game_Map.prototype.update = function(sceneActive)
{
	UltraMode7_Game_Map_prototype_update.call(this, sceneActive);
	if (this._useUltraMode7)
	{
		this.updateUltraMode7();
	}
};

Game_Map.prototype.updateUltraMode7 = function()
{
	var needRefresh = false;
	const shake = $gameScreen.shake();
	if (this._ultraMode7Shake !== shake)
	{
		this._ultraMode7Shake = shake
		needRefresh = true;
	}
	var duration = 0;
	if (this._ultraMode7FovDuration !== undefined && this._ultraMode7FovDuration > 0)
	{
		duration = this._ultraMode7FovDuration;
		this._ultraMode7Fov = Math.max((this._ultraMode7Fov * (duration - 1) + this._ultraMode7FovTarget) / duration, UltraMode7.MIN_FOV);
		--this._ultraMode7FovDuration;
		needRefresh = true;
	}
	if (this._ultraMode7PitchDuration !== undefined && this._ultraMode7PitchDuration > 0)
	{
		duration = this._ultraMode7PitchDuration;
		this._ultraMode7Pitch = ((this._ultraMode7Pitch * (duration - 1) + this._ultraMode7PitchTarget) / duration).clamp(UltraMode7.MIN_PITCH, UltraMode7.MAX_PITCH);
		--this._ultraMode7PitchDuration;
		needRefresh = true;
	}
	if (this._ultraMode7YawDuration !== undefined && this._ultraMode7YawDuration > 0)
	{
		duration = this._ultraMode7YawDuration;
		this._ultraMode7Yaw = (this._ultraMode7Yaw * (duration - 1) + this._ultraMode7YawTarget) / duration;
		--this._ultraMode7YawDuration;
		needRefresh = true;
	}
	if (this._ultraMode7RollDuration !== undefined && this._ultraMode7RollDuration > 0)
	{
		duration = this._ultraMode7RollDuration;
		this._ultraMode7Roll = (this._ultraMode7Roll * (duration - 1) + this._ultraMode7RollTarget) / duration;
		--this._ultraMode7RollDuration;
		needRefresh = true;
	}
	if (this._ultraMode7CameraDistanceDuration !== undefined && this._ultraMode7CameraDistanceDuration > 0)
	{
		duration = this._ultraMode7CameraDistanceDuration;
		this._ultraMode7CameraDistance = Math.max((this._ultraMode7CameraDistance * (duration - 1) + this._ultraMode7CameraDistanceTarget) / duration, 0);
		--this._ultraMode7CameraDistanceDuration;
		needRefresh = true;
	}
	if (this._ultraMode7CameraYDuration !== undefined && this._ultraMode7CameraYDuration > 0)
	{
		duration = this._ultraMode7CameraYDuration;
		this._ultraMode7CameraY = (this._ultraMode7CameraY * (duration - 1) + this._ultraMode7CameraYTarget) / duration;
		--this._ultraMode7CameraYDuration;
		needRefresh = true;
	}
	if (this._ultraMode7NearClipZDuration !== undefined && this._ultraMode7NearClipZDuration > 0)
	{
		duration = this._ultraMode7NearClipZDuration;
		this._ultraMode7NearClipZ = (this._ultraMode7NearClipZ * (duration - 1) + this._ultraMode7NearClipZTarget) / duration;
		--this._ultraMode7NearClipZDuration;
		needRefresh = true;
	}
	if (this._ultraMode7FarClipZDuration !== undefined && this._ultraMode7FarClipZDuration > 0)
	{
		duration = this._ultraMode7FarClipZDuration;
		this._ultraMode7FarClipZ = (this._ultraMode7FarClipZ * (duration - 1) + this._ultraMode7FarClipZTarget) / duration;
		--this._ultraMode7FarClipZDuration;
		needRefresh = true;
	}
	if (this._ultraMode7FadeColorDuration !== undefined && this._ultraMode7FadeColorDuration > 0)
	{
		duration = this._ultraMode7FadeColorDuration;
		for (var i = 0; i < this._ultraMode7FadeColor.length; ++i)
		{
			this._ultraMode7FadeColor[i] = Math.max((this._ultraMode7FadeColor[i] * (duration - 1) + this._ultraMode7FadeColorTarget[i]) / duration, 0);
		}
		--this._ultraMode7FadeColorDuration;
		needRefresh = true;
	}
	if (this._ultraMode7FadeBeginDuration !== undefined && this._ultraMode7FadeBeginDuration > 0)
	{
		duration = this._ultraMode7FadeBeginDuration;
		this._ultraMode7FadeBegin = Math.max((this._ultraMode7FadeBegin * (duration - 1) + this._ultraMode7FadeBeginTarget) / duration, 0);
		--this._ultraMode7FadeBeginDuration;
		needRefresh = true;
	}
	if (this._ultraMode7FadeEndDuration !== undefined && this._ultraMode7FadeEndDuration > 0)
	{
		duration = this._ultraMode7FadeEndDuration;
		this._ultraMode7FadeEnd = Math.max((this._ultraMode7FadeEnd * (duration - 1) + this._ultraMode7FadeEndTarget) / duration, 0);
		--this._ultraMode7FadeEndDuration;
		needRefresh = true;
	}
	if (needRefresh)
	{
		this.refreshUltraMode7View();
	}
};

Game_Map.prototype.animateUltraMode7Fov = function(target, frameDuration)
{
	this._ultraMode7FovTarget = target;
	this._ultraMode7FovDuration = frameDuration;
};

Game_Map.prototype.animateUltraMode7Pitch = function(target, frameDuration)
{
	this._ultraMode7PitchTarget = target;
	this._ultraMode7PitchDuration = frameDuration;
};

Game_Map.prototype.animateUltraMode7Yaw = function(target, frameDuration)
{
	this._ultraMode7YawTarget = target;
	this._ultraMode7YawDuration = frameDuration;
};

Game_Map.prototype.animateUltraMode7Roll = function(target, frameDuration)
{
	this._ultraMode7RollTarget = target;
	this._ultraMode7RollDuration = frameDuration;
};

Game_Map.prototype.animateUltraMode7CameraDistance = function(target, frameDuration)
{
	this._ultraMode7CameraDistanceTarget = target;
	this._ultraMode7CameraDistanceDuration = frameDuration;
};

Game_Map.prototype.animateUltraMode7CameraY = function(target, frameDuration)
{
	this._ultraMode7CameraYTarget = target;
	this._ultraMode7CameraYDuration = frameDuration;
};

Game_Map.prototype.animateUltraMode7NearClipZ = function(target, frameDuration)
{
	this._ultraMode7NearClipZTarget = target;
	this._ultraMode7NearClipZDuration = frameDuration;
};

Game_Map.prototype.animateUltraMode7FarClipZ = function(target, frameDuration)
{
	this._ultraMode7FarClipZTarget = target;
	this._ultraMode7FarClipZDuration = frameDuration;
};

Game_Map.prototype.animateUltraMode7FadeColor = function(target, frameDuration)
{
	this._ultraMode7FadeColorTarget = UltraMode7.validateFadeColor(target);
	this._ultraMode7FadeColorDuration = frameDuration;
};

Game_Map.prototype.animateUltraMode7FadeBegin = function(target, frameDuration)
{
	this._ultraMode7FadeBeginTarget = target;
	this._ultraMode7FadeBeginDuration = frameDuration;
};

Game_Map.prototype.animateUltraMode7FadeEnd = function(target, frameDuration)
{
	this._ultraMode7FadeEndTarget = target;
	this._ultraMode7FadeEndDuration = frameDuration;
};

//=============================================================================
// Game_CharacterBase
//=============================================================================

const UltraMode7_Game_CharacterBase_prototype_shiftY = Game_CharacterBase.prototype.shiftY;
Game_CharacterBase.prototype.shiftY = function()
{
	if (!UltraMode7.isActive())
	{
		return UltraMode7_Game_CharacterBase_prototype_shiftY.call(this);
	}
	return (this.isObjectCharacter() ? 0 : UltraMode7.CHARACTERS_SHIFT_Y);
};

const UltraMode7_Game_CharacterBase_prototype_screenX = Game_CharacterBase.prototype.screenX;
Game_CharacterBase.prototype.screenX = function()
{
	const x = UltraMode7_Game_CharacterBase_prototype_screenX.call(this);
	if (!UltraMode7.isActive())
	{
		return x;
	}
	const y = UltraMode7_Game_CharacterBase_prototype_screenY.call(this);
	return UltraMode7.mapToScreen(x, y).x;
};

const UltraMode7_Game_CharacterBase_prototype_screenY = Game_CharacterBase.prototype.screenY;
Game_CharacterBase.prototype.screenY = function()
{
	const y = UltraMode7_Game_CharacterBase_prototype_screenY.call(this);
	if (!UltraMode7.isActive())
	{
		return y;
	}
	const x = UltraMode7_Game_CharacterBase_prototype_screenX.call(this);
	return UltraMode7.mapToScreen(x, y).y;
};

Game_CharacterBase.prototype.screenScale = function()
{
	if (!UltraMode7.isActive())
	{
		return 1.0;
	}
	const x = UltraMode7_Game_CharacterBase_prototype_screenX.call(this);
	const y = UltraMode7_Game_CharacterBase_prototype_screenY.call(this);
	return UltraMode7.mapToScreenScale(x, y);
};

Game_CharacterBase.prototype.screenBlendColor = function()
{
	if (!UltraMode7.isActive() || !UltraMode7.CHARACTERS_USE_FADE_Z)
	{
		return null;
	}
	const x = UltraMode7_Game_CharacterBase_prototype_screenX.call(this);
	const y = UltraMode7_Game_CharacterBase_prototype_screenY.call(this);
	const z = UltraMode7.mapToScreen(x, y).z;
	const fadeBegin = $gameMap.ultraMode7FadeBegin;
	const fadeEnd = $gameMap.ultraMode7FadeEnd;
	const fadeColor = $gameMap.ultraMode7FadeColor;
	const result = [Math.round(fadeColor[0] * 255), Math.round(fadeColor[1] * 255), Math.round(fadeColor[2] * 255), 0];
	if (z >= fadeEnd)
	{
		result[3] = 255;
	}
	else if (z > fadeBegin && z < fadeEnd)
	{
		result[3] = Math.round((z - fadeBegin) / (fadeEnd - fadeBegin) * 255);
	}
	return result;
};

Game_CharacterBase.prototype.isUltraMode7Visible = function()
{
	if (!UltraMode7.isActive())
	{
		return true;
	}
	if ($gameMap.ultraMode7Fov <= 0)
	{
		return true;
	}
	const x = UltraMode7_Game_CharacterBase_prototype_screenX.call(this);
	const y = UltraMode7_Game_CharacterBase_prototype_screenY.call(this);
	return UltraMode7.isVisibleByZ(UltraMode7.mapToScreen(x, y).z);
};

//=============================================================================
// Game_Player
//=============================================================================

const UltraMode7_Game_Player_prototype_getInputDirection = Game_Player.prototype.getInputDirection;
Game_Player.prototype.getInputDirection = function()
{
	var result = UltraMode7_Game_Player_prototype_getInputDirection.call(this);
	if (UltraMode7.isActive() && result > 0 && UltraMode7.PLAYER_ADJUST_MOVE_DIRECTION)
	{
		result = UltraMode7.rotateDirection(result, false);
	}
	return result;
};

//=============================================================================
// Game_Vehicle
//=============================================================================

Game_Vehicle.prototype.scrolledX = function()
{
	if (!UltraMode7.isActive() || !$gameMap.isLoopHorizontal())
	{
		return Game_Character.prototype.scrolledX.call(this);
	}
	return $gameMap.adjustUltraMode7LoopedPosition(this._realX, this._realY).x;
};

Game_Vehicle.prototype.scrolledY = function()
{
	if (!UltraMode7.isActive() || !$gameMap.isLoopVertical())
	{
		return Game_Character.prototype.scrolledY.call(this);
	}
	return $gameMap.adjustUltraMode7LoopedPosition(this._realX, this._realY).y;
};

//=============================================================================
// Game_Event
//=============================================================================

Game_Event.prototype.scrolledX = function()
{
	if (!UltraMode7.isActive() || !$gameMap.isLoopHorizontal())
	{
		return Game_Character.prototype.scrolledX.call(this);
	}
	return $gameMap.adjustUltraMode7LoopedPosition(this._realX, this._realY).x;
};

Game_Event.prototype.scrolledY = function()
{
	if (!UltraMode7.isActive() || !$gameMap.isLoopVertical())
	{
		return Game_Character.prototype.scrolledY.call(this);
	}
	return $gameMap.adjustUltraMode7LoopedPosition(this._realX, this._realY).y;
};

//=============================================================================
// Sprite_Character
//=============================================================================

const UltraMode7_Sprite_Character_prototype_updateBitmap = Sprite_Character.prototype.updateBitmap;
Sprite_Character.prototype.updateBitmap = function()
{
	const imageChanged = this.isImageChanged();
	UltraMode7_Sprite_Character_prototype_updateBitmap.call(this);
	if (UltraMode7.isActive() && imageChanged && this.bitmap)
	{
		this.bitmap.smooth = !UltraMode7.CHARACTERS_PIXELATED;
	}
};

const UltraMode7_Sprite_Character_prototype_characterPatternY = Sprite_Character.prototype.characterPatternY;
Sprite_Character.prototype.characterPatternY = function()
{
	if (!UltraMode7.isActive() || !UltraMode7.CHARACTERS_ADJUST_SPRITE_DIRECTION)
	{
		return UltraMode7_Sprite_Character_prototype_characterPatternY.call(this);
	}
	return (UltraMode7.rotateDirection(this._character.direction(), true) - 2) / 2;
};

const UltraMode7_Sprite_Character_prototype_updateHalfBodySprites = Sprite_Character.prototype.updateHalfBodySprites;
Sprite_Character.prototype.updateHalfBodySprites = function()
{
	if (UltraMode7.isActive())
	{
		const blendColor = this._character.screenBlendColor();
		if (blendColor !== null)
		{
			this.setBlendColor(blendColor);
		}
	}
	UltraMode7_Sprite_Character_prototype_updateHalfBodySprites.call(this);
};

const UltraMode7_Sprite_Character_prototype_update = Sprite_Character.prototype.update;
Sprite_Character.prototype.update = function()
{
	if (!UltraMode7.isActive())
	{
		UltraMode7_Sprite_Character_prototype_update.call(this);
		return;
	}
	if (!!this._character)
	{
		this._ultraMode7PreUpdate();
	}
	UltraMode7_Sprite_Character_prototype_update.call(this);
	if (!!this._character)
	{
		this._ultraMode7Update();
	}
};

Sprite_Character.prototype._ultraMode7PreUpdate = function()
{
	this.scale.x = 1;
	this.scale.y = 1;
	this.rotation = 0;
};

Sprite_Character.prototype._ultraMode7Update = function()
{
	const scale = this._character.screenScale();
	this.scale.x *= scale;
	this.scale.y *= scale;
	this.rotation += Math.PI * $gameMap.ultraMode7Roll / 180;
};

const UltraMode7_Sprite_Character_prototype_updateVisibility = Sprite_Character.prototype.updateVisibility;
Sprite_Character.prototype.updateVisibility = function()
{
	UltraMode7_Sprite_Character_prototype_updateVisibility.call(this);
	if (!UltraMode7.isActive())
	{
		return;
	}
	if (!this._character.isUltraMode7Visible())
	{
		this.visible = false;
	}
};

//=============================================================================
// Sprite_Destination
//=============================================================================

const UltraMode7_Sprite_Destination_prototype_updatePosition = Sprite_Destination.prototype.updatePosition;
Sprite_Destination.prototype.updatePosition = function()
{
	UltraMode7_Sprite_Destination_prototype_updatePosition.call(this);
	if (!UltraMode7.isActive())
	{
		return;
	}
	const position = UltraMode7.mapToScreen(this.x, this.y);
	this.x = position.x;
	this.y = position.y;
};

//=============================================================================
// Scene_Map
//=============================================================================

const UltraMode7_Scene_Map_prototype_processMapTouch = Scene_Map.prototype.processMapTouch;
Scene_Map.prototype.processMapTouch = function()
{
	if (!UltraMode7.isActive())
	{
		UltraMode7_Scene_Map_prototype_processMapTouch.call(this);
		return;
	}
	if (TouchInput.isTriggered() || this._touchCount > 0)
	{
		if (TouchInput.isPressed())
		{
			if (this._touchCount === 0 || this._touchCount >= 15)
			{
				const position = UltraMode7.screenToMap(TouchInput.x, TouchInput.y);
				$gameTemp.setDestination(Math.floor(position.x / $gameMap.tileWidth()), Math.floor(position.y / $gameMap.tileHeight()));
			}
			++this._touchCount;
		}
		else
		{
			this._touchCount = 0;
		}
	}
};

//=============================================================================
// MOG's Character Motion compatibility
//=============================================================================

try // if this breaks for some reason, so it doesn't break other compatibility code
{
	if (Imported && Imported.MOG_CharacterMotion)
	{
		UltraMode7.log("Detected 'MOG'S Character Motion', enabling compatibility code.");
		
		//=============================================================================
		// Sprite_Character
		//=============================================================================

		const UltraMode7_Sprite_Character_prototype_updateSprParameters = Sprite_Character.prototype.updateSprParameters;
		Sprite_Character.prototype.updateSprParameters = function()
		{
			UltraMode7_Sprite_Character_prototype_updateSprParameters.call(this);
			if (!UltraMode7.isActive())
			{
				return;
			}
			// some safety guards
			if (!!this._character && !!this._character.screenBlendColor)
			{
				const blendColor = this._character.screenBlendColor();
				if (blendColor !== null)
				{
					this.setBlendColor(blendColor);
				}
			}
		}
	}
}
catch (error)
{
	console.log(error);
}

//=============================================================================
// Yanfly's Grid-Free Doodads compatibility
//=============================================================================

try // if this breaks for some reason, so it doesn't break other compatibility code
{
	if (Imported && Imported.YEP_GridFreeDoodads)
	{
		UltraMode7.log("Detected 'Yanfly's Grid-Free Doodads', enabling compatibility code.");
		
		//=============================================================================
		// Sprite_Doodad
		//=============================================================================

		Sprite_Doodad.prototype._makeLoopedScreenPosition = function()
		{
			const loopedPosition = $gameMap.adjustUltraMode7LoopedPosition(this._data.x / this._tileWidth, this._data.y / this._tileHeight);
			return {x: loopedPosition.x * $gameMap.tileWidth(), y: loopedPosition.y * $gameMap.tileHeight()};
		};
		
		const UltraMode7_Sprite_Doodad_updatePosition = Sprite_Doodad.prototype.updatePosition;
		Sprite_Doodad.prototype.updatePosition = function()
		{
			UltraMode7_Sprite_Doodad_updatePosition.call(this);
			if (!UltraMode7.isActive())
			{
				return;
			}
			const scale = this.screenScale();
			this.scale.x = scale * this._data.scaleX / 100;
			this.scale.y = scale * this._data.scaleY / 100;
			this._updateRotation();
			const blendColor = this.screenBlendColor();
			if (blendColor !== null)
			{
				this.setBlendColor(blendColor);
			}
			if (!this.isUltraMode7Visible())
			{
				this.visible = false;
			}
		};
		
		Sprite_Doodad.prototype._updateRotation = function()
		{
			this.rotation = (this._data.rotation !== undefined ? this._data.rotation : 0) + Math.PI * $gameMap.ultraMode7Roll / 180;
		};
		
		const UltraMode7_Sprite_Doodad_prototype_screenX = Sprite_Doodad.prototype.screenX;
		Sprite_Doodad.prototype.screenX = function()
		{
			if (!UltraMode7.isActive())
			{
				return UltraMode7_Sprite_Doodad_prototype_screenX.call(this);
			}
			const position = this._makeLoopedScreenPosition();
			return UltraMode7.mapToScreen(position.x, position.y).x;
		};
		
		const UltraMode7_Sprite_Doodad_prototype_screenY = Sprite_Doodad.prototype.screenY;
		Sprite_Doodad.prototype.screenY = function()
		{
			if (!UltraMode7.isActive())
			{
				return UltraMode7_Sprite_Doodad_prototype_screenY.call(this);
			}
			const position = this._makeLoopedScreenPosition();
			return UltraMode7.mapToScreen(position.x, position.y).y;
		};

		Sprite_Doodad.prototype.screenScale = function()
		{
			if (!UltraMode7.isActive())
			{
				return 1.0;
			}
			const position = this._makeLoopedScreenPosition();
			return UltraMode7.mapToScreenScale(position.x, position.y);
		};

		Sprite_Doodad.prototype.screenBlendColor = function()
		{
			if (!UltraMode7.isActive() || !UltraMode7.CHARACTERS_USE_FADE_Z)
			{
				return null;
			}
			const position = this._makeLoopedScreenPosition();
			const z = UltraMode7.mapToScreen(position.x, position.y).z;
			const fadeBegin = $gameMap.ultraMode7FadeBegin;
			const fadeEnd = $gameMap.ultraMode7FadeEnd;
			const fadeColor = $gameMap.ultraMode7FadeColor;
			const result = [Math.round(fadeColor[0] * 255), Math.round(fadeColor[1] * 255), Math.round(fadeColor[2] * 255), 0];
			if (z >= fadeEnd)
			{
				result[3] = 255;
			}
			else if (z > fadeBegin && z < fadeEnd)
			{
				result[3] = Math.round((z - fadeBegin) / (fadeEnd - fadeBegin) * 255);
			}
			return result;
		};

		Sprite_Doodad.prototype.isUltraMode7Visible = function()
		{
			if (!UltraMode7.isActive())
			{
				return true;
			}
			if ($gameMap.ultraMode7Fov <= 0)
			{
				return true;
			}
			const position = this._makeLoopedScreenPosition();
			return UltraMode7.isVisibleByZ(UltraMode7.mapToScreen(position.x, position.y).z);
		};
		
		// ZephAM_YEPDoodadExt compatbility fix
		if (Sprite_Doodad.prototype.extendSettings)
		{
			const UltraMode7_Sprite_Doodad_prototype_extendSettings = Sprite_Doodad.prototype.extendSettings;
			Sprite_Doodad.prototype.extendSettings = function()
			{
				UltraMode7_Sprite_Doodad_prototype_extendSettings.call(this);
				this._updateRotation();
			};
		}

		//=============================================================================
		// Sprite_DoodadCursor
		//=============================================================================

		if (!!Sprite_DoodadCursor) // this class doesn't seem to exist in deployed builds
		{
			const UltraMode7_Sprite_DoodadCursor_prototype_updatePosition = Sprite_DoodadCursor.prototype.updatePosition;
			Sprite_DoodadCursor.prototype.updatePosition = function()
			{
				UltraMode7_Sprite_DoodadCursor_prototype_updatePosition.call(this);
				if (!UltraMode7.isActive())
				{
					return;
				}
				const scale = this.screenScale();
				this.scale.x = scale * this._data.scaleX / 100;
				this.scale.y = scale * this._data.scaleY / 100;
				this.rotation = Math.PI * $gameMap.ultraMode7Roll / 180;
			};
			
			Sprite_DoodadCursor.prototype.screenScale = function()
			{
				if (!UltraMode7.isActive())
				{
					return 1.0;
				}
				const position = UltraMode7.screenToMap(this.x, this.y);
				const loopedPosition = $gameMap.adjustUltraMode7LoopedPosition(position.x / $gameMap.tileWidth(), position.y / $gameMap.tileHeight());
				const x = Math.round(loopedPosition.x * $gameMap.tileWidth());
				const y = Math.round(loopedPosition.y * $gameMap.tileHeight());
				return UltraMode7.mapToScreenScale(x, y);
			};

			Sprite_DoodadCursor.prototype.ultraMode7ScreenScale = function(x, y)
			{
				if (!UltraMode7.isActive())
				{
					return 1.0;
				}
				return UltraMode7.mapToScreenScale(x, y);
			};
		}
		
		//=============================================================================
		// DoodadManager
		//=============================================================================

		if (!!DoodadManager) // this class doesn't seem to exist in deployed builds
		{
			DoodadManager.getUltraMode7DoodadScreenX = function(x)
			{
				return (x - $gameMap.displayX() * $gameMap.tileWidth());
			};
			
			DoodadManager.getUltraMode7DoodadScreenY = function(y)
			{
				return (y - $gameMap.displayY() * $gameMap.tileHeight());
			};
			
			const UltraMode7_DoodadManager_addNew = DoodadManager.addNew;
			DoodadManager.addNew = function(doodad)
			{
				if (UltraMode7.isActive())
				{
					const position = UltraMode7.screenToMap(DoodadManager.getUltraMode7DoodadScreenX(doodad.x), DoodadManager.getUltraMode7DoodadScreenY(doodad.y));
					doodad.x = position.x;
					doodad.y = position.y;
				}
				UltraMode7_DoodadManager_addNew.call(this, doodad);
			};
		}
		
	}
}
catch (error)
{
	console.log(error);
}

//=============================================================================
// KhasUltraLighting compatibility
//=============================================================================

try // if this breaks for some reason, so it doesn't break other compatibility code
{
	if (Khas && Khas.Lighting && Khas.Lighting.version >= 4.2)
	{
		UltraMode7.log("Detected 'KhasUltraLighting', enabling compatibility code.");
		
		//=============================================================================
		// Game_CharacterBase
		//=============================================================================

		Game_CharacterBase.prototype.lightScreenUltraMode7X = function()
		{
			return Math.round((this.scrolledX() + 0.5) * $gameMap.tileWidth() + $gameScreen.shake());
		};

		Game_CharacterBase.prototype.lightScreenUltraMode7Y = function()
		{
			return Math.round((this.scrolledY() + 0.5) * $gameMap.tileHeight());
		};

		const UltraMode7_Game_CharacterBase_prototype_lightScreenX = Game_CharacterBase.prototype.lightScreenX;
		Game_CharacterBase.prototype.lightScreenX = function()
		{
			if (!UltraMode7.isActive())
			{
				return UltraMode7_Game_CharacterBase_prototype_lightScreenX.call(this);
			}
			const x = this.lightScreenUltraMode7X();
			const y = this.lightScreenUltraMode7Y() + $gameMap.tileHeight() / 2;
			return UltraMode7.mapToScreen(x, y).x;
		};

		const UltraMode7_Game_CharacterBase_prototype_lightScreenY = Game_CharacterBase.prototype.lightScreenY;
		Game_CharacterBase.prototype.lightScreenY = function()
		{
			if (!UltraMode7.isActive())
			{
				return UltraMode7_Game_CharacterBase_prototype_lightScreenY.call(this);
			}
			const halfTileHeight = $gameMap.tileHeight() / 2;
			const x = this.lightScreenUltraMode7X();
			const y = this.lightScreenUltraMode7Y() + halfTileHeight;
			return UltraMode7.mapToScreen(x, y).y - halfTileHeight * this.screenScale();
		};

		//=============================================================================
		// Game_LightTile
		//=============================================================================

		Game_LightTile.prototype.scrolledX = function()
		{
			if (!UltraMode7.isActive() || !$gameMap.isLoopHorizontal())
			{
				return $gameMap.adjustX(this._realX);
			}
			return $gameMap.adjustUltraMode7LoopedPosition(this._realX, this._realY).x;
		};

		Game_LightTile.prototype.scrolledY = function()
		{
			if (!UltraMode7.isActive() || !$gameMap.isLoopVertical())
			{
				return $gameMap.adjustY(this._realY);
			}
			return $gameMap.adjustUltraMode7LoopedPosition(this._realX, this._realY).y;
		};

		Game_LightTile.prototype.lightScreenUltraMode7X = function()
		{
			return Math.round(this.scrolledX() * $gameMap.tileWidth() + $gameScreen.shake());
		};

		Game_LightTile.prototype.lightScreenUltraMode7Y = function()
		{
			return Math.round(this.scrolledY() * $gameMap.tileHeight());
		};

		Game_LightTile.prototype.screenScale = function()
		{
			if (!UltraMode7.isActive())
			{
				return 1.0;
			}
			const x = this.lightScreenUltraMode7X() + $gameMap.tileWidth() / 2;
			const y = this.lightScreenUltraMode7Y() + $gameMap.tileHeight() / 2;
			return UltraMode7.mapToScreenScale(x, y);
		};

		Game_LightTile.prototype.isUltraMode7Visible = function()
		{
			if (!UltraMode7.isActive())
			{
				return true;
			}
			if ($gameMap.ultraMode7Fov <= 0)
			{
				return true;
			}
			const x = this.lightScreenUltraMode7X() + $gameMap.tileWidth() / 2;
			const y = this.lightScreenUltraMode7Y() + $gameMap.tileHeight() / 2;
			return UltraMode7.isVisibleByZ(UltraMode7.mapToScreen(x, y).z);
		};

		const UltraMode7_Game_LightTile_prototype_lightScreenX = Game_LightTile.prototype.lightScreenX;
		Game_LightTile.prototype.lightScreenX = function()
		{
			if (!UltraMode7.isActive())
			{
				return UltraMode7_Game_LightTile_prototype_lightScreenX.call(this);
			}
			const x = this.lightScreenUltraMode7X();
			const y = this.lightScreenUltraMode7Y() + $gameMap.tileHeight() / 2;
			return UltraMode7.mapToScreen(x, y).x;
		};

		const UltraMode7_Game_LightTile_prototype_lightScreenY = Game_LightTile.prototype.lightScreenY;
		Game_LightTile.prototype.lightScreenY = function()
		{
			if (!UltraMode7.isActive())
			{
				return UltraMode7_Game_LightTile_prototype_lightScreenY.call(this);
			}
			const halfTileHeight = $gameMap.tileHeight() / 2;
			const x = this.lightScreenUltraMode7X();
			const y = this.lightScreenUltraMode7Y() + halfTileHeight;
			return UltraMode7.mapToScreen(x, y).y - halfTileHeight * this.screenScale();
		};

		//=============================================================================
		// Sprite_Light
		//=============================================================================

		const UltraMode7_Sprite_Light_prototype_refreshScreenPosition = Sprite_Light.prototype.refreshScreenPosition;
		Sprite_Light.prototype.refreshScreenPosition = function()
		{
			UltraMode7_Sprite_Light_prototype_refreshScreenPosition.call(this);
			if (!UltraMode7.isActive())
			{
				return;
			}
			// some safety guards to ensure compatibility with custom objects
			if (!!this._character)
			{
				if (!!this._character.screenScale)
				{
					const scale = this._character.screenScale();
					this.scale.x = scale;
					this.scale.y = scale;
				}
				this.rotation = Math.PI * $gameMap.ultraMode7Roll / 180;
				if (!!this._character.isUltraMode7Visible)
				{
					this.visible = this._character.isUltraMode7Visible();
				}
			}
		};
	}
}
catch (error)
{
	// can cause error by simple not existing so no logging is done
}

//=============================================================================
// MOG's Character Motion compatibility
//=============================================================================

try // if this breaks for some reason, so it doesn't break other compatibility code
{
	if (Imported && Imported.Soul_ThomasEdisonMV)
	{
		UltraMode7.log("Detected 'Thomas Edison MV', enabling compatibility code.");
		
		//=============================================================================
		// EdisonLightMVCustom
		//=============================================================================
		
		const UltraMode7_EdisonLightMVCustom_prototype_updateLight = EdisonLightMVCustom.prototype.updateLight;
		EdisonLightMVCustom.prototype.updateLight = function()
		{
			UltraMode7_EdisonLightMVCustom_prototype_updateLight.call(this);
			if (!UltraMode7.isActive())
			{
				return;
			}
			const character = $gameMap._events[this.eventId];
			// some safety guards
			if (!!character && !!character.screenScale)
			{
				const scale = character.screenScale();
				this.lightImage.x += (scale - 1) * this.ax;
				this.lightImage.y += (scale - 1) * this.ay;
				this.lightImage.scale.x *= scale;
				this.lightImage.scale.y *= scale;
			}
		};
		
		//=============================================================================
		// EdisonLightMV
		//=============================================================================
		
		const UltraMode7_EdisonLightMV_prototype_updateLight = EdisonLightMV.prototype.updateLight;
		EdisonLightMV.prototype.updateLight = function()
		{
			UltraMode7_EdisonLightMV_prototype_updateLight.call(this);
			if (!UltraMode7.isActive())
			{
				return;
			}
			const character = $gameMap._events[this.eventId];
			// some safety guards
			if (!!character && !!character.screenScale)
			{
				const scale = character.screenScale();
				const ax = this.lightImage.x - character.screenX();
				const ay = this.lightImage.y - character.screenY();
				this.lightImage.x += (scale - 1) * ax;
				this.lightImage.y += (scale - 1) * ay;
				this.lightImage.scale.x *= scale;
				this.lightImage.scale.y *= scale;
			}
		};
		
	}
}
catch (error)
{
	console.log(error);
}

//=============================================================================
// Quasi Simple Shadows compatibility
//=============================================================================

try // if this breaks for some reason, so it doesn't break other compatibility code
{
	if (Imported && Imported.QuasiSimpleShadows)
	{
		UltraMode7.log("Detected 'Quasi Simple Shadows', enabling compatibility code.");
		
		//=============================================================================
		// Sprite_CharacterShadow
		//=============================================================================
		
		const UltraMode7_Sprite_CharacterShadow_prototype_updateScaleOpacity = Sprite_CharacterShadow.prototype.updateScaleOpacity;
		Sprite_CharacterShadow.prototype.updateScaleOpacity = function()
		{
			UltraMode7_Sprite_CharacterShadow_prototype_updateScaleOpacity.call(this);
			if (!UltraMode7.isActive())
			{
				return;
			}
			if (!!this._character)
			{
				if (!!this._character.screenScale)
				{
					const scale = this._character.screenScale();
					this.scale.x *= scale;
					this.scale.y *= scale;
				}
				this.rotation = Math.PI * $gameMap.ultraMode7Roll / 180;
				if (!!this._character.screenBlendColor)
				{
					const blendColor = this._character.screenBlendColor();
					if (blendColor !== null)
					{
						this.setBlendColor(blendColor);
					}
				}
			}
		};
		
	}
}
catch (error)
{
	console.log(error);
}

//=============================================================================
// OcRam_Lights compatibility
//=============================================================================

try // if this breaks for some reason, so it doesn't break other compatibility code
{
	if (Imported && Imported.OcRam_Core && Imported.OcRam_Lights)
	{
		UltraMode7.log("Detected 'OcRam Lights', enabling compatibility code.");
		
		// CoRam Lights has a local class called Light_Data which is not exposed so it can't be modified from the outside.
		// Luckily Game_Follower.setupLightData has a simple implementation of instantiating Light_Data so this is used
		// to pull out the constructor of Light_Data so it can be modified by Ultra Mode 7 for compatibility.
		var _dummy = {};
		Game_Follower.prototype.setupLightData.call(_dummy, 1, 1, [255, 255, 255]);
		const Light_Data = _dummy._lightData.constructor;
		_dummy = undefined;
		
		// utility functions for terrain positions
		
		const _terrainScreenX = function()
		{
			const x = this.UltraMode7_screenX_OC();
			if (!UltraMode7.isActive())
			{
				return x;
			}
			return UltraMode7.mapToScreen(x, this.UltraMode7_screenY_OC()).x;
		};

		const _terrainScreenY = function()
		{
			const y = this.UltraMode7_screenY_OC();
			if (!UltraMode7.isActive())
			{
				return y;
			}
			return UltraMode7.mapToScreen(this.UltraMode7_screenX_OC(), y).y;
		};
		
		//=============================================================================
		// Game_CharacterBase
		//=============================================================================
		
		const UltraMode7_Game_CharacterBase_prototype_screenX_OC = Game_CharacterBase.prototype.screenX_OC;
		Game_CharacterBase.prototype.screenX_OC = function()
		{
			const x = UltraMode7_Game_CharacterBase_prototype_screenX_OC.call(this);
			if (!UltraMode7.isActive())
			{
				return x;
			}
			const y = UltraMode7_Game_CharacterBase_prototype_screenY_OC.call(this);
			return UltraMode7.mapToScreen(x, y + OcRam.twh50[0]).x;
		};

		const UltraMode7_Game_CharacterBase_prototype_screenY_OC = Game_CharacterBase.prototype.screenY_OC;
		Game_CharacterBase.prototype.screenY_OC = function()
		{
			const y = UltraMode7_Game_CharacterBase_prototype_screenY_OC.call(this);
			if (!UltraMode7.isActive())
			{
				return y;
			}
			const x = UltraMode7_Game_CharacterBase_prototype_screenX_OC.call(this);
			return UltraMode7.mapToScreen(x, y + OcRam.twh50[0]).y;
		};
		
		//=============================================================================
		// Light_Data
		//=============================================================================
		
		const UltraMode7_Light_Data_prototype_initialize = Light_Data.prototype.initialize;
		Light_Data.prototype.initialize = function(parent, lightType, lightColor, radius, exParams)
		{
			UltraMode7_Light_Data_prototype_initialize.call(this, parent, lightType, lightColor, radius, exParams);
			if (UltraMode7.isActive() && this._parentObject !== null)
			{
				// to make sure the initial setup works properly
				if (this._parentObject instanceof Game_CharacterBase) // map character
				{
					this._currentRadius = this._radius * this._parentObject.screenScale();
				}
				else if (this._parentObject._tagId !== undefined) // terrain tag
				{
					this._parentObject.UltraMode7_screenX_OC = this._parentObject.screenX_OC;
					this._parentObject.UltraMode7_screenY_OC = this._parentObject.screenY_OC;
					this._parentObject.screenX_OC = _terrainScreenX;
					this._parentObject.screenY_OC = _terrainScreenY;
					const x = this._parentObject.UltraMode7_screenX_OC();
					const y = this._parentObject.UltraMode7_screenY_OC();
					this._currentRadius = this._radius * UltraMode7.mapToScreenScale(x, y);
				}
			}
		};
		
		const UltraMode7_Light_Data_prototype_update = Light_Data.prototype.update;
		Light_Data.prototype.update = function(lightLayer, ctx)
		{
			if (!UltraMode7.isActive())
			{
				UltraMode7_Light_Data_prototype_update.call(this, lightLayer, ctx);
				return;
			}
			if (this._parentObject === null || lightLayer === undefined)
			{
				UltraMode7_Light_Data_prototype_update.call(this, lightLayer, ctx);
				return;
			}
			const isCharacter = (this._parentObject instanceof Game_CharacterBase);
			const isTerrain = (this._parentObject._tagId !== undefined);
			if (!isCharacter && !isTerrain)
			{
				UltraMode7_Light_Data_prototype_update.call(this, lightLayer, ctx);
				return;
			}
			var x = 0;
			var y = 0;
			if (isCharacter)
			{
				// using this method is safer than the custom code with isVisibleByZ() below
				if (!this._parentObject.isUltraMode7Visible())
				{
					return;
				}
				x = UltraMode7_Game_CharacterBase_prototype_screenX_OC.call(this._parentObject);
				y = UltraMode7_Game_CharacterBase_prototype_screenY_OC.call(this._parentObject);
			}
			else
			{
				x = this._parentObject.UltraMode7_screenX_OC();
				y = this._parentObject.UltraMode7_screenY_OC();
			}
			const position = UltraMode7.mapToScreen(x, y);
			if (isTerrain && !UltraMode7.isVisibleByZ(position.z))
			{
				return;
			}
			const radius = this._radius;
			const currentRadius = this._currentRadius;
			const ox = this._lightExParams.offset[0];
			const oy = this._lightExParams.offset[1];
			const angle = this._lightExParams.angle;
			// using != 0 instead of !== 0 because the original code does that as well
			const manualAngle = (this._lightExParams.angle || this._lightExParams.rotation != 0 ? true : false);
			var scale = 1;
			if (isCharacter)
			{
				scale = this._parentObject.screenScale();
			}
			else
			{
				scale = UltraMode7.mapToScreenScale(x, y);
			}
			this._radius *= scale;
			this._currentRadius = this._radius;
			this._lightExParams.offset[0] = this._lightExParams.offset[0] * scale;
			this._lightExParams.offset[1] = this._lightExParams.offset[1] * scale - OcRam.twh50[0] * scale;
			// custom angle
			if (!manualAngle && this._parentObject._direction !== undefined)
			{
				const direction = this._parentObject._direction;
				if (direction === 2 || direction === 4 || direction === 6 || direction === 8 ||
					direction === 1 || direction === 3 || direction === 7 || direction === 9)
				{
					var tx = 0;
					var ty = 0;
					if (direction === 3 || direction === 6 || direction === 9)
					{
						tx = 1;
					}
					else if (direction === 1 || direction === 4 || direction === 7)
					{
						tx = -1;
					}
					if (direction === 1 || direction === 2 || direction === 3)
					{
						ty = 1;
					}
					else if (direction === 7 || direction === 8 || direction === 9)
					{
						ty = -1;
					}
					const directionPosition = UltraMode7.mapToScreen(x + tx * 10, y + ty * 10);
					const directionX = directionPosition.x - position.x;
					const directionY = directionPosition.y - position.y;
					this._lightExParams.angle = (Math.atan2(-directionY, directionX) * 360 / (Math.PI * 2) + 360).mod(360);
					// due to the original code not properly checking for angle === 0
					if (this._lightExParams.angle < 0.1)
					{
						this._lightExParams.angle = 0.1;
					}
				}
			}
			UltraMode7_Light_Data_prototype_update.call(this, lightLayer, ctx);
			this._radius = radius;
			this._currentRadius = currentRadius;
			this._lightExParams.offset[0] = ox;
			this._lightExParams.offset[1] = oy;
			if (!manualAngle)
			{
				this._lightExParams.angle = angle;
			}
		};
		
	}
}
catch (error)
{
	console.log(error);
}

//=============================================================================
// SAN_AnalogMove compatibility
//=============================================================================

try // if this breaks for some reason, so it doesn't break other compatibility code
{
	if (Imported && Imported.SAN_AnalogMove)
	{
		UltraMode7.log("Detected 'SAN AnalogMove', enabling compatibility code.");
		
		const UltraMode7_CharacterMover_radToDir8 = CharacterMover.radToDir8;
		CharacterMover.radToDir8 = function(radian)
		{
			if (UltraMode7.isActive() && UltraMode7.PLAYER_ADJUST_MOVE_DIRECTION)
			{
				radian = (radian + Math.PI * $gameMap.ultraMode7Yaw / 180);
			}
			return UltraMode7_CharacterMover_radToDir8.call(this, radian);
		};

		const UltraMode7_CharacterMover_dir8ToRad = CharacterMover.dir8ToRad;
		CharacterMover.dir8ToRad = function(dir8)
		{
			var result = UltraMode7_CharacterMover_dir8ToRad.call(this, dir8);
			if (UltraMode7.isActive() && UltraMode7.PLAYER_ADJUST_MOVE_DIRECTION)
			{
				result = (result - Math.PI * $gameMap.ultraMode7Yaw / 180);
			}
			return result;
		};

		const UltraMode7_CharacterMover_radToDir4 = CharacterMover.radToDir4;
		CharacterMover.radToDir4 = function(radian)
		{
			if (UltraMode7.isActive() && UltraMode7.PLAYER_ADJUST_MOVE_DIRECTION)
			{
				radian = (radian + Math.PI * $gameMap.ultraMode7Yaw / 180);
			}
			return UltraMode7_CharacterMover_radToDir4.call(this, radian);
		};

	}
}
catch (error)
{
	console.log(error);
}

//=============================================================================
// Galv Map Projectiles
//=============================================================================

try // if this breaks for some reason, so it doesn't break other compatibility code
{
	if (Imported && Imported.Galv_MapProjectiles)
	{
		UltraMode7.log("Detected 'Galv Map Projectiles', enabling compatibility code.");
		
		UltraMode7.Galv_MapProjectiles_RANDOM_START_FRAMES = false;
		UltraMode7.Galv_MapProjectiles_Y_OFFSET = 24; // vertical offsets so projectiles don't appear on the floor
		
		//=============================================================================
		// Scene_Map
		//=============================================================================

		// disable mouse move for map (again) if setting is enabled
		if (Galv.PROJ.mouseMove)
		{
			Scene_Map.prototype.processMapTouch = function() {};
		};
		
		//=============================================================================
		// Galv.PROJ
		//=============================================================================

		const UltraMode7_Galv_PROJ_getTarget = Galv.PROJ.getTarget;
		Galv.PROJ.getTarget = function(id)
		{
			if (UltraMode7.isActive() && !Number.isInteger(id) && id === 'm')
			{
				const position = UltraMode7.screenToMap(TouchInput.x, TouchInput.y);
				return {x: Math.floor(position.x / Galv.PROJ.tileSize), y: Math.floor(position.y / Galv.PROJ.tileSize), _characterName: true};
			}
			return UltraMode7_Galv_PROJ_getTarget(id);
		};

		//=============================================================================
		// Sprite_MapProjectile
		//=============================================================================

		const UltraMode7_Sprite_MapProjectile_setBitmap = Sprite_MapProjectile.prototype.setBitmap;
		Sprite_MapProjectile.prototype.setBitmap = function()
		{
			UltraMode7_Sprite_MapProjectile_setBitmap.call(this);
			if (UltraMode7.Galv_MapProjectiles_RANDOM_START_FRAMES && this._frames && this._frameSpeed)
			{
				this._cFrame = Math.randomInt(this._frames);
				this._fTicker = Math.randomInt(this._frameSpeed);
			}
		};

		Sprite_MapProjectile.prototype._makeLoopedScreenPosition = function()
		{
			// +0.5 required because of weird calculation offset in coordinates in Galv Map Projectiles
			const loopedPosition = $gameMap.adjustUltraMode7LoopedPosition(this._obj.x / Galv.PROJ.tileSize, this._obj.y / Galv.PROJ.tileSize + 0.5);
			return {x: loopedPosition.x * Galv.PROJ.tileSize, y: loopedPosition.y * Galv.PROJ.tileSize};
		};
		
		const UltraMode7_Sprite_MapProjectile_updatePosition = Sprite_MapProjectile.prototype.updatePosition;
		Sprite_MapProjectile.prototype.updatePosition = function()
		{
			if (!UltraMode7.isActive())
			{
				UltraMode7_Sprite_MapProjectile_updatePosition.call(this);
				return;
			}
			const mapPosition = this._makeLoopedScreenPosition();
			const position = UltraMode7.mapToScreen(mapPosition.x, mapPosition.y);
			this.x = position.x;
			this.y = position.y + this._yo - UltraMode7.Galv_MapProjectiles_Y_OFFSET;
			const scale = UltraMode7.mapToScreenScale(mapPosition.x, mapPosition.y);
			this.scale.x = scale;
			this.scale.y = scale;
			const blendColor = this.screenBlendColor();
			if (blendColor !== null)
			{
				this.setBlendColor(blendColor);
			}
			if (!this.isUltraMode7Visible())
			{
				this.visible = false;
			}
		};
		
		const UltraMode7_Sprite_MapProjectile_updateDirection = Sprite_MapProjectile.prototype.updateDirection;
		Sprite_MapProjectile.prototype.updateDirection = function()
		{
			UltraMode7_Sprite_MapProjectile_updateDirection.call(this);
			const yo = this._yo && this._yoFix ? this._yo / 48 : 0;
			const sMapPosition = $gameMap.adjustUltraMode7LoopedPosition(this._obj.sTarget.x + 0.5, this._obj.sTarget.y + 0.5);
			const eMapPosition = $gameMap.adjustUltraMode7LoopedPosition(this._obj.eTarget.x + 0.5, this._obj.eTarget.y + 0.5);
			const sPosition = UltraMode7.mapToScreen(sMapPosition.x * Galv.PROJ.tileSize, sMapPosition.y * Galv.PROJ.tileSize + yo);
			const ePosition = UltraMode7.mapToScreen(eMapPosition.x * Galv.PROJ.tileSize, eMapPosition.y * Galv.PROJ.tileSize);
			const angle = Math.atan2(ePosition.y - sPosition.y, ePosition.x - sPosition.x) * 180 / Math.PI;
			this.rotation = (angle + 90) * Math.PI / 180;
		};
		
		Sprite_MapProjectile.prototype.screenBlendColor = function()
		{
			if (!UltraMode7.isActive() || !UltraMode7.CHARACTERS_USE_FADE_Z)
			{
				return null;
			}
			const position = this._makeLoopedScreenPosition();
			const z = UltraMode7.mapToScreen(position.x, position.y).z;
			const fadeBegin = $gameMap.ultraMode7FadeBegin;
			const fadeEnd = $gameMap.ultraMode7FadeEnd;
			const fadeColor = $gameMap.ultraMode7FadeColor;
			const result = [Math.round(fadeColor[0] * 255), Math.round(fadeColor[1] * 255), Math.round(fadeColor[2] * 255), 0];
			if (z >= fadeEnd)
			{
				result[3] = 255;
			}
			else if (z > fadeBegin && z < fadeEnd)
			{
				result[3] = Math.round((z - fadeBegin) / (fadeEnd - fadeBegin) * 255);
			}
			return result;
		};

		Sprite_MapProjectile.prototype.isUltraMode7Visible = function()
		{
			if (!UltraMode7.isActive())
			{
				return true;
			}
			if ($gameMap.ultraMode7Fov <= 0)
			{
				return true;
			}
			const position = this._makeLoopedScreenPosition();
			return UltraMode7.isVisibleByZ(UltraMode7.mapToScreen(position.x, position.y).z);
		};

	}
}
catch (error)
{
	console.log(error);
}

//=============================================================================

})();
