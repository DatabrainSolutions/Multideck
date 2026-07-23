using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class AcciDimensionMapping
{
    public Guid AccidmId { get; set; }

    public Guid AccidmConnectionId { get; set; }

    public string AccidmDimensionTypeCode { get; set; } = null!;

    public string? AccidmLocalTable { get; set; }

    public Guid? AccidmLocalId { get; set; }

    public string? AccidmLocalCode { get; set; }

    public string? AccidmLocalNameSnapshot { get; set; }

    public string AccidmProviderDimensionId { get; set; } = null!;

    public string? AccidmProviderDimensionCode { get; set; }

    public string? AccidmProviderDimensionName { get; set; }

    public bool AccidmIsDefault { get; set; }

    public bool AccidmIsActive { get; set; }

    public DateTime AccidmCreatedAt { get; set; }

    public virtual AcciConnection AccidmConnection { get; set; } = null!;

    public virtual AcciDimensionType AccidmDimensionTypeCodeNavigation { get; set; } = null!;
}
