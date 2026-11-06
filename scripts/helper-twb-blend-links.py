# Lists the data blending per worksheet of a Tableau .twb (unzipped .twbx).
# In: path of the .twb. Out: one line per worksheet and secondary source:
# sheet, primary, secondary, the secondary's dimension fields (= the
# link fields Tableau keeps for the blend), and the measures it reads.
# The first source in a worksheet's <datasources> is the primary.
# Run: python -I scripts/helper-twb-blend-links.py <file.twb> [out.csv]
import csv
import sys
import xml.etree.ElementTree as ET

root = ET.parse(sys.argv[1]).getroot()
captions = {}
for ds in root.iter('datasource'):
    if ds.get('caption'):
        captions[ds.get('name')] = ds.get('caption').replace('Live_', '')


def short(name):
    return captions.get(name, name)


rows = []
for ws in root.iter('worksheet'):
    view = ws.find('table/view')
    if view is None:
        continue
    order = [d.get('name') for d in view.findall('datasources/datasource')]
    order = [n for n in order if n != 'Parameters']
    if len(order) < 2:
        continue
    primary = order[0]
    deps = {}
    for dep in view.findall('datasource-dependencies'):
        deps[dep.get('datasource')] = dep
    for sec in order[1:]:
        dep = deps.get(sec)
        dims = []
        meas = []
        if dep is not None:
            for ci in dep.findall('column-instance'):
                col = ci.get('column').strip('[]')
                if ci.get('type') in ('nominal', 'ordinal'):
                    dims.append(col)
                else:
                    meas.append(col)
        rows.append([
            ws.get('name'),
            short(primary),
            short(sec),
            ' + '.join(sorted(set(dims))),
            ' + '.join(sorted(set(meas))),
        ])

head = ['sheet', 'primary', 'secondary', 'link_dims', 'measures']
out = open(sys.argv[2], 'w', newline='', encoding='utf-8') \
    if len(sys.argv) > 2 else sys.stdout
w = csv.writer(out)
w.writerow(head)
w.writerows(rows)
