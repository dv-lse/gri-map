import * as d3 from 'd3'
import * as topojson from 'topojson-client'

import * as queue from 'd3-queue'
import {geoEckert3} from 'd3-geo-projection'
import * as scheme from 'd3-scale-chromatic'

const DATAPOINT = 'data/emissions.json'
const WORLD_MAP = 'world/50m.json'

const BAR_MARGINS = { top: 0, right: 15, bottom: 85, left: 15 }
const BAR_HEIGHT = 20

const EMISSIONS_TICKS = 5

const EMISSIONS_FORMAT = d3.format(',.1f')
const PERCENT_FORMAT = d3.format('.0%')

function install(elem, width, height) {

  let component = d3.dispatch('change')

  queue.queue()
    .defer(d3.json, WORLD_MAP)
    .defer(d3.json, DATAPOINT)
    .await( (err, world, countries) => {
      if(err) throw err

      // data preprocessing

      let countries_map = countries.countries

      d3.keys(countries_map).forEach( (id) => {
        countries_map[id].laws = +countries_map[id].laws
        countries_map[id].emissions = +countries_map[id].emissions
      })

      let features = topojson.feature(world, world.objects.countries).features

      let features_map = {}
      features.forEach( (d) => features_map[d.id] = d )

      let emissions_ids = d3.keys(countries_map)
      emissions_ids.sort((a,b) => {
        return d3.descending(countries_map[a].emissions, countries_map[b].emissions)
      })

      let total_emissions = d3.sum(d3.keys(countries_map), (id) => countries_map[id].emissions)

      // visualisation

      let svg = d3.select(elem)
        .append('svg')
          .attr('class', 'map')
          .attr('width', width)
          .attr('height', height)

      let g = svg.append('g')

      let projection = geoEckert3()
        .translate([0,0])
        .scale(180)
        .precision(.1)

      let path = d3.geoPath()
        .projection(projection)

      let graticule = d3.geoGraticule()

      let laws_scale = d3.scaleThreshold()
        .domain([1, 5, 10, 15, 20])
        .range(scheme.schemeBlues[7].slice(1))

      let emissions_scale = d3.scaleLinear()
        .domain([0, d3.sum(d3.keys(countries_map), (id) => countries_map[id].emissions)])
        .range([0, width - BAR_MARGINS.left - BAR_MARGINS.right ])

      let offset = 0
      let emissions = emissions_ids.map( (id,j) => {
        let v = countries_map[id] && !isNaN(countries_map[id].emissions) ? emissions_scale(countries_map[id].emissions) : 0
        let d = [ offset, offset + v ]
        d.id = id
        offset = offset + v
        return d
      })

      svg.on('click', () => {
          dropdown.property('value', null)
          focus(null)
        })

      g.append('path')
        .attr('class', 'map-sphere')
        .datum({type: 'Sphere'})
        .attr('d', path)

      g.append('path')
        .datum(graticule)
        .attr('class', 'map-graticule')
        .attr('d', path)

      let country = g.append('g')
          .attr('class', 'map-countries')
        .selectAll('.map-country')
          .data(features)

      let country_enter = country.enter().append('g')
        .attr('class', (d) => 'map-country ' + d.id + (countries_map[d.id] ? ' active' : ' inactive'))

      country_enter.append('path')
        .attr('d', path)
        .attr('fill', (d) => countries_map[d.id] ? laws_scale(countries_map[d.id].laws) : 'lightgray')

      let emissions_bar = svg.append('g')
          .attr('class', 'emissions_bar')
          .attr('transform', 'translate(' + [ BAR_MARGINS.left, height - BAR_MARGINS.bottom - BAR_HEIGHT ] + ')')
        .selectAll('.emissions')
            .data(emissions)
          .enter().append('g')
            .attr('class', (d) => 'emissions active ' + d.id)

      emissions_bar.append('path')
          .attr('d', (d) => 'M' + d[0] + ' 0H' + d[1] + 'V' + BAR_HEIGHT + 'H' + d[0] + 'Z')

      let left_justify = (d) => (d[0] + d[1]) / 2 < width / 2

      let emissions_label = emissions_bar.append('g')
        .attr('class', 'label')
        .attr('transform', (d) => 'translate(' + (left_justify(d) ? d[0] : d[1]) + ')')
        .attr('text-anchor', (d) => left_justify(d) ? 'start' : 'end')

      emissions_label.append('text')
        .attr('dy', '-3.25em')
        .text( (d) => countries_map[d.id].name )

      emissions_label.append('text')
        .attr('dy', '-1.75em')
        .text( (d) => countries_map[d.id].laws + ' laws')

      emissions_label.append('text')
        .attr('dy', '-.5em')
        .text( (d) => EMISSIONS_FORMAT(countries_map[d.id].emissions) + ' megatons')

      let emissions_axis = svg.append('g')
          .attr('class', 'axis')
          .attr('transform', 'translate(' + [ BAR_MARGINS.left, height - BAR_MARGINS.bottom] + ')')

      emissions_axis.call(d3.axisBottom(emissions_scale)
        .ticks(emissions_scale.ticks().concat(emissions_scale.domain()[1]))
        .tickFormat((d,i) => EMISSIONS_FORMAT(d) + ' megatons'))

      let ticks = emissions_axis.selectAll('.tick')
        .data([0,.25,.5,.75,1])
        .enter().append('g')
          .attr('class', 'tick')
          .attr('text-anchor', 'end')
          .attr('transform', (i) => 'translate(' + (emissions_scale.range()[1] * i) + ')')

      ticks.append('line')
        .attr('x1', 0.5)
        .attr('x2', 0.5)
        .attr('y1', 2)
        .attr('y2', 8)

      ticks.append('text')
        .attr('x', 10)
        .attr('y', 10)
        .attr('dy', '0.7em')
        .text(PERCENT_FORMAT)

      ticks.filter((i) => i === 1)
        .append('text')
          .attr('x', 10)
          .attr('y', 10)
          .attr('dy', '1.75em')
          .text((i) => EMISSIONS_FORMAT(total_emissions * i) + ' megatons')

      // interaction
      d3.selectAll('.active')
        .on('click', function(d) {
          let elem = d3.select(this)
          if(countries_map[d.id] && !elem.classed('focus')) {
            dropdown.property('value', d.id)
            focus(d.id)
          } else {
            focus(null)
          }
          d3.event.stopPropagation()
        })
        .on('mouseenter', (d) => hover(d.id))
        .on('mouseleave', () => hover(null, 500))

      let zoom = d3.zoom()
        .scaleExtent([0.9, 8])
        .on("zoom", () => {
          let t = d3.event.transform
          g.attr("transform", "translate(" + [t.x, t.y] + ")scale(" + t.k + ")translate(" + [width / 2, height / 2] + ")")
           .style('stroke-width', 1.5 / t.k + 'px')
        })

      svg.call(zoom)
         .call(zoom.transform, d3.zoomIdentity)


      // controls

      let dropdown = d3.select(elem)
        .append('select')
          .attr('class', 'map-select')
        .on('change', () => {
          var iso = d3.event.target.value
          focus(iso)
        })

      dropdown.selectAll('option')
          .data([null].concat(d3.keys(countries_map)))
         .enter().append('option')
           .attr('value', (d) => d)
           .html((d) => d ? countries_map[d].name : '...')


      // Utility functions

      let hover_id = null
      function hover(id, delay=100) {
        hover_id = id
        setTimeout(clear, delay)

        function clear() {
          if(hover_id !== id) return
          svg.selectAll('.active')
            .classed('hover', (d) => d.id === id && countries_map[id])
        }
      }

      function focus(id) {
        svg.selectAll('.active')
          .classed('focus', (d) => d.id === id)

        component.call('change', null, null)

        if(!id) {
          svg.transition()
            .duration(2000)
            .call(zoom.transform, d3.zoomIdentity)
        } else {
          let t = focus_coords(id)
          svg.transition()
            .duration(2000)
            .on('end', () => component.call('change', null, countries_map[id].name))
            .call(zoom.transform, d3.zoomIdentity
              .translate(-t.x,-t.y)
              .scale(t.scale))
        }
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

        return { x: center[0] / scale, y: center[1] / scale, scale: scale }
      }
    })

  return component
}

export { install }
