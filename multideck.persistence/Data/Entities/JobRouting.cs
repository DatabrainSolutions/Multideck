using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class JobRouting
{
    public Guid JobRouteId { get; set; }

    public Guid JobId { get; set; }

    public int? JobRouteLegType { get; set; }

    public DateTime? JobRouteLegEtd { get; set; }

    public DateTime? JobRouteLegEta { get; set; }

    public int? JobRouteOrderNo { get; set; }

    public string? JobRouteOriginUnlocode { get; set; }

    public string? JobRouteDestinationUnlocode { get; set; }

    public Guid? JobRouteCarrier { get; set; }

    public Guid? JobRouteMode { get; set; }

    public string? JobRouteVessel { get; set; }

    public string? JobRouteVoyageNumber { get; set; }

    public bool? JobRouteTracked { get; set; }
}
