import * as d3 from 'd3'
import * as topojson from 'topojson-client'

import * as queue from 'd3-queue'
import {geoEckert3} from 'd3-geo-projection'
import * as scheme from 'd3-scale-chromatic'

import '../styles/map.css!'

const DATAPOINT = 'data/countries_db_for_map.csv'
const WORLD_MAP = 'world/50m.json'

const METRIC = 'Country-reported GHG emissions (incl. LULUCF) (MTCO2)'


function install(elem, width, height, cachetag) {

  let component = d3.dispatch('change')

  queue.queue()
    .defer(d3.json, WORLD_MAP)
    .defer(d3.csv, DATAPOINT)
    .await( (err, world, countries) => {
      if(err) throw err

      // data preprocessing

      countries.forEach( (d) => d[METRIC] = +d[METRIC] )
      countries.sort( (a,b) => d3.ascending(a.Country, b.Country))

      let countries_map = {}
      countries.forEach( (d) => countries_map[d.ISO] = d)

      // visualisation

      let svg = d3.select(elem)
        .append('svg')
          .attr('class', 'map')
          .attr('width', width)
          .attr('height', height)
        .append('g')

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

      svg.append('path')
        .datum(graticule)
        .attr('class', 'map-graticule')
        .attr('d', path)
        .on('click', () => {
          dropdown.property('value', 'NONE')
          focus(null)
        })

      let country = svg.append('g')
          .attr('class', 'map-countries')
        .selectAll('.map-country')
          .data(features)

      country.enter().append('path')
        .attr('class', (d) => 'map-country ' + d.id + (countries_map[d.id] ? ' active' : ' inactive'))
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

      svg.call(zoom.transform, transform)

      // controls

      let dropdown = d3.select(elem)
        .append('select')
          .attr('class', 'map-select')
        .on('change', () => {
          var iso = d3.event.target.value
          iso = iso === 'NULL' ? null : iso
          focus(iso)
        })

      dropdown.selectAll('option')
          .data([null].concat(countries.map( (d) => d.ISO)))
         .enter().append('option')
           .attr('value', (d) => d) // || 'NONE')
           .html((d) => d ? countries_map[d].Country : '...')

      // Utility functions

      function hover(id) {
        d3.selectAll('.map-country')
          .classed('hover', (d) => d.id === id && countries_map[id])
      }

      function focus(id) {
        d3.selectAll('.map-country')
          .classed('focus', false)

        component.call('change', null, null)

        if(!(id && countries_map[id])) {
          svg.transition()
            .duration(2000)
            .call(zoom.transform, transform)
        } else {
          d3.selectAll('.country.' + id)
            .classed('focus', true)

          let t = focus_coords(id)
          let trans = svg.transition()
            .duration(2000)
            .on('end', () => component.call('change', null, countries_map[id].Country))
            .call(zoom.transform, d3.zoomIdentity
              .translate(width/5,height/2)
              .scale(t.scale)
              .translate(-t.x,-t.y))

        }
      }

      function transform() {
        return d3.zoomIdentity
          .translate(width/2,height/2)
          .scale(1)
      }

      function zoomed() {
        let t = d3.event.transform
        svg.attr('transform', t)
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
        let scale = Math.max(1, Math.min(20, 0.9 / Math.max(dx / width, dy / height)))

        return { x: center[0], y: center[1], scale: scale }
      }
    })

  return component
}

export { install }
