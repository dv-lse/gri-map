import * as d3 from 'd3'
import * as topojson from 'topojson-client'

import * as queue from 'd3-queue'
import {geoEckert3} from 'd3-geo-projection'
import * as scheme from 'd3-scale-chromatic'

const DATAPOINT = 'data/emissions.json' //'http://www.lse.ac.uk/GranthamInstitute/wp-json/countries/v1/data/55783476/'
const WORLD_MAP = 'world/50m.json'

const BAR_MARGINS = { top: 0, right: 25, bottom: 65, left: 20 }
const BAR_HEIGHT = 20

const LEGEND_MARGINS = { top: 50, right: 50, bottom: 20, left: 20 }
const LEGEND_WIDTH = 10

const BACKGROUND_MARGINS = { top: 5, right: 7, bottom: 5, left: 7 }

function install(elem, width, height) {

  // main application state

  let focus_id = null

  queue.queue()
    .defer(d3.json, WORLD_MAP)
    .defer(d3.json, DATAPOINT)
    .await( (err, world, countries) => {
      if(err) throw err

      // post-process countries dataset [ dropdown & emissions bar ]

      countries.forEach( (d) => d.id = d.iso)
      countries.sort( (a,b) => d3.ascending(a.name, b.name) )
      let root = d3.stratify()
        .id((d) => d.id || d.iso)
        .parentId((d) => d.id !== 'ROOT' ? d.parent_iso || 'ROOT' : undefined)
        (countries.concat({id:'ROOT'}))

      root.eachAfter( (d) => d.value = d.children && d.children.length ? d3.sum(d.children, (v) => v.value) : d.data.emissions)
        .sort( (a,b) => d3.descending(a.value, b.value) )

      // post-process map [ move laws count into GIS dataset ]

      let features = topojson.feature(world, world.objects.countries).features
      let land = topojson.feature(world, world.objects.land).features
      let borders = topojson.feature(world, world.objects.borders).features

      let by_iso = countries.reduce( (m, d) => (m[d.iso] = d, m), {} )
      features.forEach( (d) => {
        if(d.id in by_iso) {
          Object.assign(d.properties, by_iso[d.id])
          d.url = d.properties.url
        }
      })
      features = features.filter((d) => d.properties.laws)

      // visualisation

      let svg = d3.select(elem)
        .append('svg')
          .attr('class', 'map')
          .attr('width', width)
          .attr('height', height)

      let g = svg.append('g')

      let projection = geoEckert3()
        .scale(100)               // arbitrary; reqd to since unit scale causes floating point errors
        .translate([0, 0])
        .precision(.1)

      let path = d3.geoPath()
        .projection(projection)

      let sphere_bounds = path.bounds({type:'Sphere'})
      // (scale that fits entire globe to width x height)
      let sphere_scale = Math.min(width / (sphere_bounds[1][0] - sphere_bounds[0][0]),
                                  height / (sphere_bounds[1][1] - sphere_bounds[0][1]))

      let graticule = d3.geoGraticule()

      let laws_scale = d3.scaleThreshold()
        .domain([2, 5, 10, 15, 20])
        .range(scheme.schemeBlues[7].slice(1))

      let emissions_scale = d3.scaleLinear()
        .domain([0, d3.sum(countries, (d) => d.emissions)])
        .range([0, width - BAR_MARGINS.left - BAR_MARGINS.right ])

      let partition = d3.partition()
        .size([width - BAR_MARGINS.left - BAR_MARGINS.right, BAR_HEIGHT])
        .padding(1)
        .round(true)

      partition(root)

      let percent_fmt = d3.format('.1%')
      let emissions_fmt = d3.format(',.1f')

      // SVG elements

      svg.on('click', () => {
        focus(null)
      })

      // map

      g.append('path')
        .attr('class', 'map-sphere')
        .datum({type: 'Sphere'})
        .attr('d', path)

      g.append('path')
        .datum(graticule)
        .attr('class', 'map-graticule')
        .attr('d', path)

      g.append('path')
        .datum(land[0])
        .attr('class', 'map-land')
        .attr('d', path)

      g.append('g')
          .attr('class', 'map-features')
        .selectAll('.map-feature')
          .data(features)
         .enter().append('g')
          .attr('class', (d) => 'map-feature country ' + d.id)
          .append('path')
            .attr('d', path)
            .attr('fill', (d) => laws_scale(d.properties.laws))

      g.append('path')
        .datum(borders[0])
        .attr('class', 'map-borders')
        .attr('d', path)

      // map legend

      let legend_scale = d3.scaleLinear()
        .domain([0, d3.max(features, (d) => d.properties.laws)])
        .range([0, height / 2])

      let legend_axis = d3.axisRight(legend_scale)
        .tickSize(LEGEND_WIDTH+4)
        .tickValues(laws_scale.domain())

      let legend = svg.append('g')
        .attr('class', 'legend')
        .attr('transform', 'translate(' + [width - LEGEND_MARGINS.right - LEGEND_WIDTH, LEGEND_MARGINS.top] + ')')

      legend.append('rect')
        .attr('class', 'background')

      legend.append('text')
        .attr('y', '-1em')
        .attr('fill', 'black')
        .text('Laws')

      legend.selectAll('.group')
        .data(laws_scale.range().map((c) => {
          let d = laws_scale.invertExtent(c)
          if(d[0] == null) d[0] = legend_scale.domain()[0]
          if(d[1] == null) d[1] = legend_scale.domain()[1]
          return d
        }))
        .enter().append('rect')
          .attr('class', 'group')
          .attr('width', LEGEND_WIDTH)
          .attr('y', (d) => legend_scale(d[0]))
          .attr('height', (d) => legend_scale(d[1]) - legend_scale(d[0]))
          .attr('fill', (d) => laws_scale(d[0]))

      legend.call(legend_axis)

      legend.select('.domain')
        .remove()

      // emissions bar

      let left_justify = (d) => (d.x0 + d.x1) / 2 < width / 2
      let emissions_bar = svg.append('g')
        .attr('class', 'emissions_bar')
        .attr('transform', 'translate(' + [ BAR_MARGINS.left, height - BAR_MARGINS.bottom - BAR_HEIGHT ] + ')')

      // TODO. move this into opaque stroke on each path?
      emissions_bar.append('rect')
        .attr('class', 'background')

      let emissions = emissions_bar.selectAll('.emissions')
            .data(root.descendants().filter((d) => d.depth > 0))
          .enter().append('g')
            .attr('class', (d) => 'emissions country ' + d.data.iso)

      emissions.append('path')
        .attr('d', (d) => {
          let h = BAR_HEIGHT / (d.depth + d.height)
          return 'M' + Math.round(d.x0) + ' ' + Math.round(BAR_HEIGHT - d.depth * h) +
                 'H' + Math.round(d.x1) + 'v' + Math.round(h) +
                 'H' + Math.round(d.x0) + 'Z'
        })

      let emissions_label = emissions.append('g')
        .attr('class', 'label')
        .attr('transform', (d) => 'translate(' + (left_justify(d) ? d.x0 : d.x1) + ')')
        .attr('text-anchor', (d) => left_justify(d) ? 'start' : 'end')

      emissions_label.append('text')
        .attr('dy', '-3.75em')
        .text( (d) => d.data.name )

      emissions_label.append('text')
        .attr('dy', '-2.25em')
        .text( (d) => d.data.laws + ' laws')

      emissions_label.append('text')
        .attr('dy', '-1em')
        .text( (d) => {
          let pct = d.data.emissions / emissions_scale.domain()[1]
          return emissions_fmt(d.data.emissions) + ' MtCO2e [ ' + (pct < 0.001 ? '≤ 0.1%' : percent_fmt(pct)) + ' ]'
        })

      let emissions_axis = emissions_bar.append('g')
          .attr('class', 'axis')
          .attr('transform', 'translate(0,' + BAR_HEIGHT + ')')

      let ticks = emissions_axis.selectAll('.tick')
        .data(d3.range(0, 1.1, 0.1))
        .enter().append('g')
          .attr('class', 'tick')
          .attr('text-anchor', 'end')
          .attr('transform', (i) => 'translate(' + (emissions_scale.range()[1] * i) + ')')

      ticks.append('line')
        .attr('x1', 0.5)
        .attr('x2', 0.5)
        .attr('y1', 2)
        .attr('y2', 8)

      ticks.filter((d,i) => i % 2 === 0)
        .append('text')
          .attr('x', 10)
          .attr('y', 10)
          .attr('dy', '0.7em')
          .text(d3.format('.0%'))

      ticks.filter((i) => i === 1)
        .append('text')
          .attr('x', 10)
          .attr('y', 10)
          .attr('dy', '1.75em')
          .text((d) => emissions_fmt(emissions_scale.domain()[1] * d) + ' MtCO2e' )

      function update(sel, hover_id) {
        sel.selectAll('.map-feature path')
          // TODO move logic into a D3 selector by class?  this only goes up one level
          .attr('fill', (d) => d.properties.iso == hover_id || d.properties.parent_iso == hover_id ? 'orange' : laws_scale(d.properties.laws))
        sel.selectAll('.emissions path')
          .attr('fill', (d) => d.id !== hover_id ? 'orange' : 'red')
        sel.selectAll('.emissions .label')
          .attr('opacity', (d) => d.id !== hover_id ? 0 : 1)
      }

      // prettify heads-up display using opacity

      d3.selectAll('rect.background').each(function() {
        let bbox = this.parentNode.getBBox()
        d3.select(this)
          .attr('x', bbox.x - BACKGROUND_MARGINS.left)
          .attr('y', bbox.y - BACKGROUND_MARGINS.top)
          .attr('width', bbox.width + BACKGROUND_MARGINS.left + BACKGROUND_MARGINS.right)
          .attr('height', bbox.height + BACKGROUND_MARGINS.top + BACKGROUND_MARGINS.bottom)
        })

      // interaction

      d3.selectAll('.country path')
        .on('click', function(d) {
          focus(d.id !== focus_id ? d : null)
          d3.event.stopPropagation()
        })
        .on('mouseenter', (d) => focus_id || highlight(d.id) )
        .on('mouseleave', () => focus_id || highlight(null) )

      let zoom = d3.zoom()
        .translateExtent(sphere_bounds)
        .scaleExtent([sphere_scale, sphere_scale * 20])
        .on('zoom', () => {
          let t = d3.event.transform
          g.attr('transform', t)
           .style('stroke-width', (1 / t.k) + 'px')
        })

      svg.call(update, null)
         .call(zoom)
         .call(zoom.transform, zoomTransformFit())


      // HTML controls

      let dropdown = d3.select(elem)
        .append('select')
          .attr('class', 'map-select')
        .on('change', () => {
          let iso = d3.event.target.value
          focus(iso !== 'NONE' ? by_iso[iso] : null)
        })

      dropdown.selectAll('option')
           .data([null].concat(countries))
         .enter().append('option')
           .attr('value', (d) => d ? d.iso : 'NONE')
           .html((d) => d ? d.name : '...')

      let detail = d3.select(elem).append('iframe')
        .attr('id', 'gri-detail')
        .attr('src', '')

      function focus(d) {
        // Update application state
        //   NB input object must have id & url properties
        //   NB does NOT fire a change event, so no loops
        focus_id = d ? d.id : null
        dropdown.property('value', focus_id || 'NONE')

        highlight(focus_id)

        let feature = features.find((d) => d.id === focus_id)

        console.log(JSON.stringify([focus_id, d3.geoBounds(feature)]))

        let t = svg.transition('zoom')
          .duration(2000)
          .call(zoom.transform, zoomTransformFit(focus_id ? d3.geoBounds(feature) : null))

//        detail.attr('src', d ? d.url : '')
      }

      // utility functions

      function highlight(id) {
        svg.transition('highlight')
          .duration(500)
          .call(update, id)
      }

      function zoomTransformFit(bbox=null) {
        let f = bbox ? {type: 'LineString', coordinates: bbox} : {type: 'Sphere'}
        let b = path.bounds(f)
        let k = .9 * Math.min(width / (b[1][0] - b[0][0]),
                              height / (b[1][1] - b[0][1]))
        let x = (b[0][0] + b[1][0]) / 2
        let y = (b[0][1] + b[1][1]) / 2

        let t = d3.zoomIdentity
          .translate(width / 2 - k * x, height / 2 - k * y)
          .scale(k)

        return t
      }
    })
}

export { install }
