using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class AccAptransLine
{
    public Guid AccAplineId { get; set; }

    public Guid AccAplineHeaderId { get; set; }

    public Guid? AccAplineJobId { get; set; }

    public Guid? AccAplineChargeId { get; set; }

    public string? AccAplineDescription { get; set; }

    public string? AccAplineNotes { get; set; }

    public int? AccAplineCurrency { get; set; }

    public decimal? AccAplineRoe { get; set; }

    public decimal? AccAplineAmount { get; set; }

    public byte[]? AccAplineTaxCode { get; set; }

    public decimal? AccAplineTaxAmount { get; set; }

    public decimal? AccAplineLocalAmount { get; set; }

    public decimal? AccAplineLocalTaxAmount { get; set; }

    public virtual AccAptransHeader AccAplineHeader { get; set; } = null!;

    public virtual JobHeader? AccAplineJob { get; set; }
}
