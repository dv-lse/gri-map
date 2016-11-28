import * as d3 from 'd3'
import * as topojson from 'topojson-client'

import {queue} from 'd3-queue'
import {geoWinkel3} from 'd3-geo-projection'
import {schemeRdBu as scheme} from 'd3-scale-chromatic'

import 'styles.css!'

// 'http://www.lse.ac.uk/GranthamInstitute/wp-content/uploads/2016/11/legislation_db_for_map.csv'
const LEGISLATION = 'data/legislation_db_for_map.csv'
const COUNTRIES = 'data/countries_db_for_map.csv'
const WORLD_MAP = 'world/50m.json'

const WIDTH = 960
const HEIGHT = 600

const MARGINS = { top: 10, right: 10, bottom: 10, left: 10 }

queue()
  .defer(d3.json, WORLD_MAP)
  .defer(d3.csv, COUNTRIES)
  .defer(d3.csv, LEGISLATION)
  .await( (err, world, countries, legislation) => {
    if(err) throw err

    // data preprocessing

    let countries_map = {}
    countries.forEach( (d) => countries_map[d.ISO] = d)

    let counts = d3.nest()
      .key( (d) => d['Country ISO'] )
      .rollup( (v) => v.length )
      .map(legislation)

    // visualisation

    let svg = d3.select('body')
      .append('svg')
        .attr('width', WIDTH + MARGINS.left + MARGINS.right)
        .attr('height', HEIGHT + MARGINS.top + MARGINS.bottom)

    let g = svg.append('g')
        .attr('transform', 'translate(' + [ MARGINS.left, MARGINS.top ] + ')')

    let map = g.append('g')

    let projection = geoWinkel3()
      .translate([0,0])
      .scale(182)
      .precision(.1)

    let path = d3.geoPath()
      .projection(projection)

    let features = topojson.feature(world, world.objects.countries).features

    var graticule = d3.geoGraticule()

    let color = d3.scaleQuantile()
      .domain(features.filter( (d) => countries_map[d.id] )
                .map( (d) => iso_count(d)))
      .range(scheme[4])

    map.append('path')
      .attr('class', 'sphere')
      .datum({type: 'Sphere'})
      .attr('d', path);

    map.append('path')
      .datum(graticule)
      .attr('class', 'graticule')
      .attr('d', path)
      .on('click', reset)

    let country = map.append('g')
        .attr('class', 'countries')
      .selectAll('.country')
        .data(features)

    country.enter().append('path')
      .attr('class', (d) => 'country')
      .attr('d', path)
      .attr('fill', (d) => countries_map[d.id] ? color(iso_count(d)) : 'lightgray' )
      .on('click', clicked)

    let zoom = d3.zoom()
      .on("zoom", zoomed)
    map.call(zoom.transform, transform)

    function reset() {
      map.transition()
        .duration(2000)
        .call(zoom.transform, transform)
    }

    function clicked(feature) {
      let bounds = path.bounds(feature)
      let dx = bounds[1][0] - bounds[0][0]
      let dy = bounds[1][1] - bounds[0][1]
      let x = (bounds[0][0] + bounds[1][0]) / 2
      let y = (bounds[0][1] + bounds[1][1]) / 2
      let scale = Math.max(1, Math.min(8, 0.9 / Math.max(dx / WIDTH, dy / HEIGHT)))
      map.transition()
        .duration(2000)
        .call(zoom.transform, d3.zoomIdentity
          .translate(WIDTH/5,HEIGHT/2)
          .scale(scale)
          .translate(-x,-y))
    }

    function transform() {
      return d3.zoomIdentity
        .translate(WIDTH/2,HEIGHT/2)
        .scale(1)
    }

    function iso_count(d) {
      return counts['$'+d.id] || 0
    }

    function zoomed() {
      let t = d3.event.transform
      map.attr('transform', t)
         .style('stroke-width', 1.5 / t.k + 'px')
    }

  })
