using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class BlPartyIdentifier
{
    public Guid BlpiId { get; set; }

    public Guid BlpiBlpId { get; set; }

    public string BlpiIdentifierKind { get; set; } = null!;

    public string BlpiValue { get; set; } = null!;

    public string? BlpiSchemeId { get; set; }

    public string? BlpiIssuingAgency { get; set; }

    public string? BlpiCountryCode { get; set; }

    public virtual BlParty BlpiBlp { get; set; } = null!;
}
