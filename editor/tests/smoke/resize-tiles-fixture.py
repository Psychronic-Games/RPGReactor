"""Disposable native-test art only. Requires Pillow; never writes source assets."""
import json, sys
from pathlib import Path
from PIL import Image, ImageDraw
source, project, size = Path(sys.argv[1]), Path(sys.argv[2]), int(sys.argv[3])
face_size = int(sys.argv[4]) if len(sys.argv) > 4 else 32
icon_size = int(sys.argv[5]) if len(sys.argv) > 5 else None
read = lambda name: json.loads((project / 'data' / name).read_text())
def write(name, value): (project / 'data' / name).write_text(json.dumps(value))
system = read('System.json')
system.update(partyMembers=[1],tileSize=size, faceSize=face_size, startMapId=1, startX=10, startY=10)
system['advanced'].update(screenWidth=816, screenHeight=624, uiAreaWidth=816, uiAreaHeight=624, screenScale=1, pixelatedRendering=True)
for vehicle in ['boat','ship','airship']: system[vehicle]['characterName']=''
if icon_size: system['iconSize'] = icon_size
write('System.json', system)
tilesets = read('Tilesets.json')
names = list(tilesets[2]['tilesetNames'])
while len(names) < 11: names.append(names[5])
for index, name in enumerate(names):
    img = Image.open(source / 'img' / 'tilesets' / (name + '.png'))
    name = 'Audit_' + str(index)
    img.resize((img.width * size // 48, img.height * size // 48), Image.Resampling.NEAREST).save(project / 'img' / 'tilesets' / (name + '.png'))
    names[index] = name
tilesets[2]['tilesetNames'] = names
# Remove authored 3D metadata for this flat test, retaining normal passability flags.
for key in list(tilesets[2]):
    if key not in ['id', 'name', 'mode', 'tilesetNames', 'flags', 'note']: del tilesets[2][key]
tilesets[2]['note'] = ''
write('Tilesets.json', tilesets)
for name in ['Map001.json', 'Map002.json']:
    m=read(name);m['tilesetId']=2
    for y in range(25):
        for x in range(25): m['data'][y*25+x] = 2816
    for i,tile in enumerate([1,257,513,769,1025,1281,1537,2048,2816,4352,5888]): m['data'][25*25+12*25+i+2]=tile
    write(name,m)
face = Image.new('RGBA',(4*face_size,2*face_size));draw=ImageDraw.Draw(face)
for i in range(8): draw.rectangle((i%4*face_size,i//4*face_size,(i%4+1)*face_size-1,(i//4+1)*face_size-1),fill=(i*30,255-i*25,50+i*20,255))
face.save(project/'img/faces/AuditFaces.png')
actors=read('Actors.json');actors[1].update(faceName='AuditFaces',faceIndex=5,characterName='$AuditTiny',characterIndex=0);write('Actors.json',actors)
char=Image.open(source/'img/characters'/next((source/'img/characters').glob('*.png')).name)
# A dedicated single-character sheet with 8px cells exercises minimum-size selection.
char.resize((24,32),Image.Resampling.NEAREST).save(project/'img/characters/$AuditTiny.png')
(project/'js/reactor_plugins.js').write_text('var $plugins = [];')

write('Database.r3d.json', {'version':1,'actors':{},'enemies':{}})

if icon_size:
    icons=Image.new('RGBA',(16*icon_size,2*icon_size));draw=ImageDraw.Draw(icons)
    for i in range(32): draw.rectangle((i%16*icon_size,i//16*icon_size,(i%16+1)*icon_size-1,(i//16+1)*icon_size-1),fill=(i*7,255-i*5,30+i*6,255))
    icons.save(project/'img/system/IconSet.png')
    items=read('Items.json');items[1]['iconIndex']=31;write('Items.json',items)
