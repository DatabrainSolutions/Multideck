using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

/// <summary>
/// Party-level registrations and identifiers such as IATA code, account, EORI, VAT, or local tax IDs.
/// </summary>
public partial class AwbPartyIdentifier
{
    public Guid AwbpiId { get; set; }

    public Guid AwbpiAwbpartyId { get; set; }

    public string AwbpiIdentifierType { get; set; } = null!;

    public string AwbpiIdentifierValue { get; set; } = null!;

    public Guid? AwbpiIssuingCountryId { get; set; }

    public string? AwbpiIssuingCountryCodeSnapshot { get; set; }

    public string? AwbpiNotes { get; set; }

    public DateTime AwbpiCreatedAt { get; set; }

    public virtual AwbParty AwbpiAwbparty { get; set; } = null!;
}
