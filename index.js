import * as d3 from 'd3'
import * as topojson from 'topojson-client'

import {queue} from 'd3-queue'
import {geoEckert3} from 'd3-geo-projection'
import * as scheme from 'd3-scale-chromatic'

import 'styles.css!'

const DATAPOINT = 'data/countries_db_for_map.csv'
const WORLD_MAP = 'world/50m.json'

const METRIC = 'Country-reported GHG emissions (incl. LULUCF) (MTCO2)'

const WIDTH = 960
const HEIGHT = 600

const MARGINS = { top: 10, right: 10, bottom: 10, left: 10 }

queue()
  .defer(d3.json, WORLD_MAP)
  .defer(d3.csv, DATAPOINT)
  .await( (err, world, countries) => {
    if(err) throw err

    // data preprocessing

    let countries_map = {}
    countries.forEach( (d) => d[METRIC] = +d[METRIC] )
    countries.sort( (a,b) => d3.ascending(a.Country, b.Country))
    countries.forEach( (d) => countries_map[d.ISO] = d)

    // controls

    let dropdown = d3.select('body')
      .append('select')
        .attr('id', 'country-select')
      .on('change', () => {
        var iso = d3.event.target.value
        focus(iso)
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
      .domain(countries.map( (d) => d[METRIC] ))
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
      .attr('fill', (d) => countries_map[d.id] ? color(countries_map[d.id][METRIC]) : 'lightgray' )
      .on('click', function(d) {
        let elem = d3.select(this)
        if(countries_map[d.id] && !elem.classed('focus')) {
          dropdown.property('value', d.id)
          focus(d.id)
        } else {
          focus(null)
        }
      })
      .on('mouseover', function(d) {
        hover(d.id)
      })
      .on('mouseout', function() {
        hover(null)
      })

    let zoom = d3.zoom()
      .on("zoom", zoomed)

    map.call(zoom.transform, transform)

    // Utility functions

    function hover(id) {
      d3.selectAll('.country')
        .classed('hover', (d) => d.id === id && countries_map[id])
    }

    function focus(id) {
      d3.selectAll('.country')
        .classed('focus', false)

      if(!id) {
        detail.style('visibility', 'hidden')
        map.transition()
          .duration(2000)
          .call(zoom.transform, transform)
      } else {
        d3.selectAll('.country.' + id)
          .classed('focus', true)

        detail.html('<h3>' + id + '</h3><p>Lorem ipsum sic amet</p>')

        let t = focus_coords(id)
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

    function zoomed() {
      let t = d3.event.transform
      map.attr('transform', t)
         .style('stroke-width', 1.5 / t.k + 'px')
    }

    function focus_coords(id) {
      let sel_features = features.filter( (d) => d.id === id && d.properties.homepart)
      let areas = sel_features.map(path.area)
      let idx = d3.range(0,areas.length).sort(d3.descending)[0]

      let bounds = path.bounds(sel_features[idx])
      let center = path.centroid(sel_features[idx])
      let dx = bounds[1][0] - bounds[0][0]
      let dy = bounds[1][1] - bounds[0][1]
      let scale = Math.max(1, Math.min(20, 0.9 / Math.max(dx / WIDTH, dy / HEIGHT)))

      return { x: center[0], y: center[1], scale: scale }
    }
  })
