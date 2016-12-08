import * as d3 from 'd3'
import * as topojson from 'topojson-client'

import {queue} from 'd3-queue'
import {geoEckert3} from 'd3-geo-projection'
import * as scheme from 'd3-scale-chromatic'

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
    countries.sort( (a,b) => d3.ascending(a.Country, b.Country))
    countries.forEach( (d) => countries_map[d.ISO] = d)

    let counts = d3.nest()
      .key( (d) => d['Country ISO'] )
      .rollup( (v) => v.length )
      .map(legislation)

    // controls

    let dropdown = d3.select('body')
      .append('select')
        .attr('id', 'country-select')
      .on('change', () => {
        var iso = d3.event.target.value
        let feature = features.filter( (d) => d.id === iso)
        if(feature.length > 0) { focus(feature[0]) }
        else { focus(null) }
      })

    let option = dropdown.selectAll('option')
        .data([null].concat(countries.map( (d) => d.ISO)))
       .enter().append('option')
         .attr('value', (d) => d || 'NONE')
         .html((d) => d ? countries_map[d].Country : '...')

    // visualisation

    let detail = d3.select('body')
      .append('div')
      .attr('id', 'country-detail')
      .style('visibility', 'hidden')

    let svg = d3.select('body')
      .append('svg')
        .attr('width', WIDTH + MARGINS.left + MARGINS.right)
        .attr('height', HEIGHT + MARGINS.top + MARGINS.bottom)

    let g = svg.append('g')
        .attr('transform', 'translate(' + [ MARGINS.left, MARGINS.top ] + ')')

    let map = g.append('g')

    let projection = geoEckert3()
      .translate([0,0])
      .scale(182)
      .precision(.1)

    let path = d3.geoPath()
      .projection(projection)

    let features = topojson.feature(world, world.objects.countries).features

    let graticule = d3.geoGraticule()

    let palette = scheme.schemeBlues[9].slice(2)

    let color = d3.scaleQuantile()
      .domain(features.filter( (d) => countries_map[d.id] )
                .map( (d) => iso_count(d)))
      .range(palette)

    map.append('path')
      .attr('class', 'sphere')
      .datum({type: 'Sphere'})
      .attr('d', path);

    map.append('path')
      .datum(graticule)
      .attr('class', 'graticule')
      .attr('d', path)
      .on('click', () => {
        dropdown.property('value', 'NONE')
        focus(null)
      })

    let country = map.append('g')
        .attr('class', 'countries')
      .selectAll('.country')
        .data(features)

    country.enter().append('path')
      .attr('class', (d) => 'country ' + d.id + (countries_map[d.id] ? ' active' : ' inactive'))
      .attr('d', path)
      .attr('fill', (d) => countries_map[d.id] ? color(iso_count(d)) : 'lightgray' )
      .on('click', function(d) {
        let elem = d3.select(this)
        console.log(elem.classed('inactive'))
        if(countries_map[d.id] && !elem.classed('focus')) {
          dropdown.property('value', d.id)
          focus(d)
        } else {
          focus(null)
        }
      })

    let zoom = d3.zoom()
      .on("zoom", zoomed)
    map.call(zoom.transform, transform)

    function focus(feature) {
      let country_info = feature ? countries_map[feature.id] : null

      d3.selectAll('.country')
        .classed('focus', false)

      if(!feature) {
        detail.style('visibility', 'hidden')
        map.transition()
          .duration(2000)
          .call(zoom.transform, transform)
      } else {
        d3.select('.country.' + feature.id)
          .classed('focus', true)

        let info = countries_map[feature.id]
        detail.html('<h3>' + info.Country + '</h3><p>Lorem ipsum sic amet</p>')
        let t = focus_coords(feature)
        let trans = map.transition()
          .duration(2000)
        trans.call(zoom.transform, d3.zoomIdentity
            .translate(WIDTH/5,HEIGHT/2)
            .scale(t.scale)
            .translate(-t.x,-t.y))
        detail.transition()
          .delay(2000)
          .style('visibility', 'visible')
      }
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

    function focus_coords(feature) {

      // for countries with multiple regions, choose the mainland
      if(feature.geometry.type === 'MultiPolygon') {
        let polygons = feature.geometry.coordinates.map( (cs) => {
          return { type: 'Polygon', coordinates: cs }
        })
        let areas = polygons.map(path.area)
        let indices = d3.range(0,polygons.length)
          .sort( (a,b) => d3.descending(areas[a], areas[b]))
        feature = polygons[indices[0]]
      }

      let bounds = path.bounds(feature)
      let center = path.centroid(feature)
      let dx = bounds[1][0] - bounds[0][0]
      let dy = bounds[1][1] - bounds[0][1]
      let scale = Math.max(1, Math.min(20, 0.9 / Math.max(dx / WIDTH, dy / HEIGHT)))

      return { x: center[0], y: center[1], scale: scale }
    }
  })
