using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class BlIdentifier
{
    public Guid BliId { get; set; }

    public Guid BliBlId { get; set; }

    public string BliIdentifierType { get; set; } = null!;

    public string BliValue { get; set; } = null!;

    public string? BliSchemeId { get; set; }

    public string? BliIssuingAgency { get; set; }

    public bool BliIsPrimary { get; set; }

    public DateTime BliCreatedAt { get; set; }

    public virtual BlHeader BliBl { get; set; } = null!;

    public virtual SysBlidentifierType BliIdentifierTypeNavigation { get; set; } = null!;
}
