# GRI Map Tool

### Set up development environment (OS X)

    cd gri-map
    npm install jspm --save-dev
    jspm install

### Build GIS files from Natural Earth

    npm install d3 d3-dsv topojson-server
    npm run prepublish
    http-server -c-1

### Build production bundle in ./dist

    npm run build
