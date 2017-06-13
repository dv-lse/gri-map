# GRI Map Tool

*Source code for the LSE Grantham Institute's interactive map of global CO2 emissions.*

See http://www.lse.ac.uk/GranthamInstitute/countries/.

Country data reflects live results from the Grantham database of climate change laws.

GIS map adapted from [Natural Earth](http://www.naturalearthdata.com/).


## Installing

The project uses [jspm](http://jspm.io) to manage runtime libraries.  JSPM and development-phase
tools are installed via [npm](https://docs.npmjs.com).

```script
cd ./gri-map
npm install                # Get development-phase tools for preprocessing GIS dataset
npm install -g jspm http-server
jspm install               # Get runtime-phase libraries
```


## Developing

```script
npm run prepublish  # downloads and builds the GIS ('world/map.json')
http-server -c-1    # displays the example web page ('./index.html')

```


## Bundling for distribution

```script
npm run build       # generates production bundle ('dist/gri-map.js*')
```


## Installing map bundle into a web page and configuring API datapoint

Javascript code, the GIS dataset, and styling are all bundled together to speed downloads and leverage the client cache.

The JS bundle exports a single function *GRIMap.install*, which takes

  (1) DOM element to install into
  (2) width and height (in pixels) of the map to create
  (3) live URL of the country data

For example:

```html
...
<script src="https://dv-lse.github.io/gri-map/dist/gri-map.js"></script>
<!-- bundle URL is for illustration only! -->
...
<div id="gri-map"><div>Loading...</div></div>
...
<script>
  var elem = document.getElementById("gri-map")
  GRIMap.install(elem, 960, 600, "/GranthamInstitute/wp-json/countries/v1/data/55783476/")
</script>
```


## Licensing

This code was developed by the LSE Division of Communications for use within the School.  It is freely available but no support is provided.
