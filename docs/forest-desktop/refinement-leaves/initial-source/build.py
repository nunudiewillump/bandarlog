from pathlib import Path
import json, math, re

ROOT=Path(__file__).resolve().parent
BASE=ROOT.parent/'codex'

# Purpose-drawn botanical geometry; the 2D silhouettes, half-tones and veins
# remain editable vectors rather than a clipped raster/sprite sheet.
BEECH='M0 0C-11-4-24-18-26-34C-28-51-15-69-3-83C11-77 23-62 24-44C26-25 13-8 0 0Z'
OAK='M0 0C-8-12-20-10-17-24C-34-21-38-34-23-41C-39-44-33-59-18-57C-28-71-15-81-6-71C-8-87 5-94 9-78C21-90 32-79 22-66C41-72 46-57 30-49C47-46 46-30 29-30C37-13 18-7 0 0Z'

def leaf(shape,fill,light,scale,angle,x=0,y=0,veins=True):
    p=OAK if shape=='oak' else BEECH
    vein='M0 0Q3-40 5-76' if shape=='oak' else 'M0 0Q-3-43-3-76'
    branches='M2-18L-13-27M3-32L20-42M4-45L-15-54M4-58L16-66' if shape=='oak' else 'M-1-20L-17-33M-2-34L16-46M-3-49L-17-59M-3-59L9-69'
    return f'<g transform="translate({x} {y}) rotate({angle}) scale({scale})"><path d="{p}" fill="{fill}"/><path d="M0 0Q3-40 5-76C18-65 27-47 20-29C15-14 6-5 0 0Z" fill="{light}" opacity=".3"/>'+ (f'<path d="{vein}" stroke="{light}" stroke-width="1.25" fill="none" opacity=".52"/><path d="{branches}" stroke="{light}" stroke-width=".9" fill="none" opacity=".34"/>' if veins else '')+'</g>'

def canopy():
    layers=[]
    # Each branch has its own location and leaf rhythm. The same three layers
    # persist; the pointer moves only nearby branchlets, never the UI chrome.
    for depth in range(3):
        clusters=[]
        for index in range(19):
            x=-40+index*111+(depth%2)*42
            y=[7,34,54][depth]+math.sin(index*1.77+depth)*8
            color=[('#133e2b','#376346'),('#1c5135','#5b8251'),('#2b6642','#87a36c')][depth]
            leaves=[]
            angles=[119,163,212,253] if depth<2 else [122,174,226]
            for j,angle in enumerate(angles):
                scale=[1.03,.94,.82][depth]+math.sin(index*2.4+j)*.11
                if depth==2 and index%4==1:scale*=1.14
                leaves.append(leaf('oak' if (index+j+depth)%3==0 else 'beech',*color,round(scale,3),angle+(index%3-1)*8,x=(j-1.5)*8,y=(j%2)*3,veins=depth>0))
            branch=f'<path d="M-27-12Q-3-2 20 9" stroke="{["#0e3021","#173d27","#294f2e"][depth]}" stroke-width="{3.2-depth*.5}" fill="none" stroke-linecap="round"/>'
            clusters.append(f'<g transform="translate({x:.1f} {y:.1f})"><g class="tree-bough" data-depth="{depth}">{branch}{"".join(leaves)}</g></g>')
        layers.append(f'<g class="botanical-plane plane-{depth}" filter="url(#leaf-shadow-{depth})">'+''.join(clusters)+'</g>')
    return '<svg class="botanical-canopy" viewBox="0 0 1920 170" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false"><defs>'+''.join(f'<filter id="leaf-shadow-{d}" x="-30%" y="-30%" width="170%" height="180%"><feDropShadow dx="0" dy="{3+d}" stdDeviation="{2+d*.4}" flood-color="#072719" flood-opacity="{.35+d*.07}"/></filter>' for d in range(3))+'</defs><path d="M0 0H1920V71C1680 62 1510 74 1300 63C1030 73 830 59 590 69C390 56 180 74 0 66Z" fill="#103b2d"/>'+''.join(layers)+'</svg>'

ART=canopy()
for source,target in [('d07.html','comms.html'),('d01.html','home.html')]:
    text=(BASE/'screens'/source).read_text()
    # These files sit one directory shallower than the original scene pages.
    text=text.replace('href="../desktop.css"','href="../codex/desktop.css"')
    text=text.replace('../../../../public/','../../../public/')
    text=re.sub(r'href="(d\d+\.html)([^"]*)"',r'href="../codex/screens/\1\2"',text)
    start=text.index('<svg class="canopy-depth"');end=text.index('<div class="header-content"',start)
    text=text[:start]+ART+text[end:]
    text=text.replace('</head>','<link rel="stylesheet" href="canopy.css"><script defer src="canopy.js"></script></head>')
    text=text.replace('<body>','<body class="leaf-refinement">')
    text=text.replace('28 octubre2026','28 octubre 2026')
    (ROOT/target).write_text(text)

(ROOT/'mobile-header.html').write_text('''<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Copa · referencia móvil</title><link rel="stylesheet" href="../codex/desktop.css"><link rel="stylesheet" href="canopy.css"><script defer src="canopy.js"></script></head><body class="leaf-refinement mobile-reference"><header class="topbar">'''+ART+'''<div class="header-content"><a class="mobile-leaf-brand" href="home.html"><img src="../../../public/brand-mark.webp" alt="" width="32" height="32">Bandarlog</a><a class="header-profile" href="../codex/screens/d45.html" aria-label="Mi perfil"><span class="avatar small">AM</span></a></div></header><main class="mobile-leaf-reference"><h1>Inicio</h1><h2>Tus tareas primero</h2><div class="mobile-reference-task"><strong>Revisar listado de material</strong><p>Material · Campamento de Navidad</p><span class="chip overdue">Vencida</span><a href="../codex/screens/d13.html" class="button secondary">Ver tarea</a></div><p class="prototype-note">Referencia de cabecera a 390 px. No sustituye el recorrido móvil aprobado.</p></main></body></html>''')

(ROOT/'asset-manifest.json').write_text(json.dumps({'scope':'Canopy-only desktop visual amendment, not an implemented product change','originalScenes':['codex/screens/d07.html','codex/screens/d01.html'],'protected':'Existing UI actions, icons, roles, data, cards and content remain unchanged outside canopy/layout spacing. Icon proposals handled separately.','canopy':{'source':'build.py purpose-drawn beech/oak leaf vectors','planes':3,'branchlets':57,'format':'inline SVG, no raster sprites, no 3D','colorFamilies':['#103b2d','#133e2b','#1c5135','#2b6642','#87a36c']},'brand':'public/brand-mark.webp unchanged','icons':'Existing catalogue untouched; not an icon-set decision','fonts':'Existing Codex Nunito Sans local font files','interaction':'canopy.js pointer-only presentation, no app/API data calls','motion':'motion-contract.json'},ensure_ascii=False,indent=2)+'\n')
print('Created two preserved desktop scenes and one canopy-only mobile reference.')
