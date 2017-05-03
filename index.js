import * as d3 from 'd3'
import * as topojson from 'topojson-client'

import {geoEckert3} from 'd3-geo-projection'
import * as scheme from 'd3-scale-chromatic'

import './styles/map.css!'

import world from './world/map.json!json'
import focus_bounds from './data/focus_bounds.json!json'

const DEFAULT_DATAPOINT = 'data/emissions.json'

const BAR_MARGINS = { top: 0, right: 105, bottom: 65, left: 15 }
const BAR_HEIGHT = 20

const LEGEND_MARGINS = { top: 30, right: 45 }            /* left is calculated */
const LEGEND_WIDTH = 10

const DETAIL_MARGIN = { top: 0, right: 35, bottom: 200 } /* left is calculated */

const BACKGROUND_MARGINS = { top: 5, right: 7, bottom: 5, left: 7 }

const FOCUS_MARGIN = 5


function install(elem, width, height, datapoint=null) {

  // main application state

  let focus_id = null

  let focus_bounds_map = focus_bounds.reduce( (m, d) => (m[d.iso] = [[+d.left,+d.bottom],[+d.right,+d.top]], m), {})

  let detail_dimensions = [
    (width - DETAIL_MARGIN.right) / 2,
    height - DETAIL_MARGIN.top - DETAIL_MARGIN.bottom
  ]

  d3.json(datapoint || DEFAULT_DATAPOINT, (err, countries) => {
      if(err) throw err

      // post-process countries dataset [ dropdown & emissions bar ]

      countries.forEach( (d) => d.id = d.iso)
      countries.sort( (a,b) => d3.ascending(a.name, b.name) )
      let root = d3.stratify()
        .id((d) => d.id || d.iso)
        .parentId((d) => d.id !== 'ROOT' ? d.parent_iso || 'ROOT' : undefined)
        (countries.concat({id:'ROOT'}))

      root.eachAfter( (d) => {
          let sum = d.children && d.children.length ? d3.sum(d.children, (v) => v.value) : 0
          d.value = Math.max(sum, d.data.emissions || 0)  // if computed value is higher use it (to fit elements visually)
        })
        .sort( (a,b) => d3.descending(a.value, b.value) )

      // post-process map [ move laws count into GIS dataset ]

      let features = topojson.feature(world, world.objects.countries).features
      let choropleth_points = topojson.feature(world, world.objects.choropleth_points).features
      let land = topojson.feature(world, world.objects.land).features
      let borders = topojson.feature(world, world.objects.borders).features

      let by_iso = root.descendants().reduce( (m, d) => (m[d.id] = d, m), {} )
      let merge_dataset = (d) => {
        if(d.id in by_iso) {
          let node = by_iso[d.id]
          Object.assign(d.properties, node.data)
          d.properties.all_ids = node.ancestors().reduce( (m, d) => (m[d.id] = true, m), {} )
          d.url = d.properties.url
        }
      }

      features = features.filter( (d) => d.id in by_iso)
      features.forEach(merge_dataset)

      choropleth_points = choropleth_points.filter( (d) => d.id in by_iso)
      choropleth_points.forEach(merge_dataset)

      // Basic data sanity checking

      let feature_ids = d3.set(features.map((d) => d.id).concat(choropleth_points.map((d) => d.id)))
      let gis_extra_ids = feature_ids.values().filter((id) => !by_iso[id]).sort()
      let data_extra_ids = d3.keys(by_iso).filter((id) => !feature_ids.has(id) && by_iso[id].height === 0).sort()

      if(gis_extra_ids.length) console.warn('ISOs in GIS, not in dataset: ' + gis_extra_ids)
      if(data_extra_ids.length) console.warn('ISOs in dataset, not in GIS: ' + data_extra_ids)

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

      d3.partition()(root)

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

      let map_features = g.append('g')
          .attr('class', 'map-features')

      map_features.selectAll('.map-feature')
          .data(features)
         .enter().append('g')
          .attr('class', (d) => 'map-feature country ' + d.id)
          .append('path')
            .attr('class', 'geometry')
            .attr('d', path)
            .attr('fill', (d) => laws_scale(d.properties.laws))

      map_features.append('path')
        .datum(borders[0])
        .attr('class', 'map-borders')
        .attr('d', path)

      map_features.selectAll('.circles')
         .data(choropleth_points)
        .enter().append('g')
         .attr('class', (d) => '  country ' + d.id)
         .append('circle')
           .attr('class', 'geometry')
           .attr('transform', (d) => 'translate(' + path.centroid(d) + ')')
           .attr('fill', (d) => laws_scale(d.properties.laws))
           .attr('r', 10)
           .attr('stroke-width', 1.5)
           .attr('stroke', 'white')

      // map legend

      let legend_scale = d3.scaleLinear()
        .domain([0, d3.max(laws_scale.domain())])
        .range([0, width / 3])

      let legend_axis = d3.axisBottom(legend_scale)
        .tickSize(LEGEND_WIDTH+4)
        .tickValues(laws_scale.domain())

      let legend = svg.append('g')
        .attr('class', 'legend')
        .attr('transform', 'translate(' + [width - LEGEND_MARGINS.right - legend_scale.range()[1], LEGEND_MARGINS.top] + ')')

      legend.append('rect')
        .attr('class', 'background')

      legend.append('text')
        .attr('x', '-1em')
        .attr('dy', '1em')
        .attr('fill', 'black')
        .attr('text-anchor', 'end')
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
          .attr('height', LEGEND_WIDTH)
          .attr('x', (d) => legend_scale(d[0]))
          .attr('width', (d) => legend_scale(d[1]) - legend_scale(d[0]))
          .attr('fill', (d) => laws_scale(d[0]))

      legend.call(legend_axis)
        .selectAll('.tick line')
        .attr('y1', -2)

      legend.select('.domain')
        .remove()

      // emissions bar

      let x = d3.scaleLinear()
        .domain([0,1])
        .range([0, width - BAR_MARGINS.left - BAR_MARGINS.right])

      let emissions_bar = svg.append('g')
        .attr('class', 'emissions_bar')
        .attr('transform', 'translate(' + [ BAR_MARGINS.left, height - BAR_MARGINS.bottom - BAR_HEIGHT ] + ')')

      emissions_bar.append('rect')
        .attr('class', 'background')

      let emissions_bar_label = emissions_bar.append('text')
        .attr('transform', 'translate(' + [width - BAR_MARGINS.left - BAR_MARGINS.right, BAR_HEIGHT / 2] + ')')
        .attr('class', 'label')
        .attr('text-anchor', 'begin')

      emissions_bar_label.append('tspan')
        .attr('x', 0)
        .attr('dx', '1em')
        .attr('dy', '-0.3em')
        .text('Global')
      emissions_bar_label.append('tspan')
        .attr('x', 0)
        .attr('y', '1em')
        .attr('dx', '1em')
        .text('Emissions')

      let emissions = emissions_bar.selectAll('.emissions')
            .data(root.descendants().filter((d) => d.depth > 0 && d.value > 0 && x(d.x1-d.x0) >= 1))
          .enter().append('g')
            .attr('class', (d) => 'emissions country ' + d.data.iso)

      emissions.append('path')
        .attr('class', 'geometry')
        .attr('stroke-width', (d) => x(d.x1-d.x0) >= 1.0 ? 1.0 : 0)
        .attr('d', (d) => {
          let h = BAR_HEIGHT / (d.depth + d.height)
          let x0 = Math.round(x(d.x0))
          let y0 = Math.round(BAR_HEIGHT - d.depth * h)
          let x1 = Math.round(x(d.x1))
          return 'M' + x0 + ' ' + y0 +
                 'H' + x1 + 'v' + Math.round(h) +
                 'H' + x0 + 'Z'
        })

      let emissions_label = emissions.append('g')
        .attr('class', 'label')
        .attr('transform', (d) => 'translate(' + x((d.x0 + d.x1) / 2) + ')')

      emissions_label.append('text')
        .attr('class', 'name')
        .attr('y', '-.5em')
        .attr('x', -5)
        .attr('text-anchor', 'middle')
        .text( (d) => d.data.name )

      let laws_label = emissions_label.append('text')
        .attr('y', BAR_HEIGHT)
        .attr('dy', '1.5em')

      laws_label.append('tspan')
        .attr('text-anchor', 'end')
        .attr('x', -5)
        .text( (d) => d.data.laws)

      laws_label.append('tspan')
        .attr('class', 'unit')
        .attr('text-anchor', 'start')
        .attr('x', 5)
        .text('laws')

      let raw_emissions_label = emissions_label.append('text')
        .attr('y', BAR_HEIGHT)
        .attr('dy', '2.75em')

      raw_emissions_label.append('tspan')
        .attr('text-anchor', 'end')
        .attr('x', -5)
        .text( (d) => emissions_fmt(d.data.emissions))

      raw_emissions_label.append('tspan')
        .attr('class', 'unit')
        .attr('text-anchor', 'start')
        .attr('x', 5)
        .text('MtCO2e')

      let percent_emissions_label = emissions_label.append('text')
        .attr('y', BAR_HEIGHT)
        .attr('dy', '4em')

      percent_emissions_label.append('tspan')
        .attr('text-anchor', 'end')
        .attr('x', -5)
        .text( (d) => {
          let pct = d.data.emissions / emissions_scale.domain()[1]
          return pct < 0.001 ? '≤ 0.1%' : percent_fmt(pct)
        })

      percent_emissions_label.append('tspan')
        .attr('class', 'unit')
        .attr('text-anchor', 'start')
        .attr('x', 5)
        .text('of global emissions')

      function update(sel, hover_id) {
        sel.selectAll('.map-features .country .geometry')
          // TODO move logic into a D3 selector by class?  this only goes up one level
          .attr('fill', (d) => d.properties.all_ids && d.properties.all_ids[hover_id] ? 'orange' : laws_scale(d.properties.laws))
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

      d3.selectAll('.country .geometry')
        .on('click', function(d) {
          focus(d.id !== focus_id ? d.id : null)
          d3.event.stopPropagation()
        })

      d3.selectAll('.country .geometry')
        .on('mouseenter', (d) => highlight(d.id || focus_id) )
        .on('mouseleave', () => highlight(focus_id) )

      let zoom = d3.zoom()
        .translateExtent(sphere_bounds)
        .scaleExtent([sphere_scale * .95, sphere_scale * 40])
        .on('zoom', () => {
          let t = d3.event.transform
          g.attr('transform', t)
            .style('stroke-width', (1 / t.k) + 'px')
          g.selectAll('.country circle')
            .attr('r', (7.5 / t.k) + 'px')
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
          focus(iso !== 'NONE' ? iso : null)
        })

      dropdown.selectAll('option')
           .data([null].concat(countries))
         .enter().append('option')
           .attr('value', (d) => d ? d.iso : 'NONE')
           .html((d) => d ? d.name : '...')

      let detail = d3.select(elem)
        .append('div')
          .attr('id', 'gri-detail')
          .attr('class', 'inactive')
          .style('left', (width - detail_dimensions[0] - DETAIL_MARGIN.right) + 'px')
      detail.append('button')
        .attr('class', 'close')
        .attr('type', 'button')
        .html('x')
        .on('click', () => focus(null))
      detail.append('iframe')
        .style('width', detail_dimensions[0] + 'px')                                  // NB allow for scrollbars
        .style('height', detail_dimensions[1] + 'px')
        .attr('src', '')

      let popup = d3.select(elem)
        .append('div')
        .attr('class', 'arrow_box')
        .html('Select a country from the dropdown, or click on the map')
        .style('opacity', 0)
        .on('click', () => popup.remove() )

      popup.transition()
        .delay(750)
        .duration(1500)
        .style('opacity', 1)

      function focus(id) {
        popup.remove()

        focus_id = id || null
        dropdown.property('value', focus_id || 'NONE')
        highlight(focus_id)

        // TODO.  simplify logic...
        let matches = features.concat(choropleth_points).filter((d) => d.properties.all_ids[focus_id])
          .map((f) => focus_bounds_map[f.id] ? {type: 'Feature', geometry: { type: 'MultiPoint', coordinates: focus_bounds_map[f.id] }} : f)
        let bounds = d3.geoBounds({type: 'FeatureCollection', features: matches})

        let zoomTransform

        if(focus_id && matches.length) {
          zoomTransform = zoomTransformFit(bounds, zoom.scaleExtent(),
                                           [detail_dimensions[0] - FOCUS_MARGIN * 2, height - FOCUS_MARGIN * 2])
        } else {
          zoomTransform = zoomTransformFit(null, zoom.scaleExtent(),
                                           [width - FOCUS_MARGIN * 2, height - FOCUS_MARGIN * 2])
        }

        let t = svg.transition('zoom')
          .duration(2000)
          .call(zoom.transform, zoomTransform)

        let url = focus_id ? by_iso[focus_id].data.url : null
        detail.attr('class', url ? 'active' : 'inactive')
          .select('iframe')
            .attr('src', url || '')
      }

      // utility functions

      let timer
      function highlight(id) {
        clearTimeout(timer)
        timer = setTimeout(() => svg.call(update, id), 200)
      }

      function zoomTransformFit(bbox=null, scaleExtent=null, dims=null) {
        let f = bbox ? {type: 'LineString', coordinates: bbox} : {type: 'Sphere'}
        let b = path.bounds(f)

        dims = dims || [width, height]

        let k = 0.9 * Math.min(dims[0] / (b[1][0] - b[0][0]),
                                dims[1] / (b[1][1] - b[0][1]))

        k = scaleExtent ? Math.max(scaleExtent[0], Math.min(scaleExtent[1], k)) : k

        let x = (b[0][0] + b[1][0]) / 2
        let y = (b[0][1] + b[1][1]) / 2

        let t = d3.zoomIdentity
          .translate(dims[0] / 2 - k * x, dims[1] / 2 - k * y)
          .scale(k)

        return t
      }
    })
}

export { install }
