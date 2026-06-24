using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class AccArtransLine
{
    public Guid AccArlineId { get; set; }

    public Guid AccArlineHeaderId { get; set; }

    public Guid AccArlineChargeId { get; set; }

    public string? AccArlineDescription { get; set; }

    public string? AccArlineNotes { get; set; }

    public int? AccArlineCurrency { get; set; }

    public decimal? AccArlineRoe { get; set; }

    public decimal? AccArlineAmount { get; set; }

    public byte[]? AccArlineTaxCode { get; set; }

    public decimal? AccArlineTaxAmount { get; set; }

    public decimal? AccArlineLocalAmount { get; set; }

    public decimal? AccArlineLocalTaxAmount { get; set; }

    public bool? AccArlineShowCurr { get; set; }

    public virtual AccArtransHeader AccArlineHeader { get; set; } = null!;
}
