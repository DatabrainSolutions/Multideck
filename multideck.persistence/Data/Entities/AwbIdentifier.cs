using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

/// <summary>
/// AWB references and external identifiers such as MAWB, HAWB, booking, shipment, Cargo-XML, and customs references.
/// </summary>
public partial class AwbIdentifier
{
    public Guid AwbiId { get; set; }

    public Guid AwbiAwbid { get; set; }

    public string AwbiIdentifierType { get; set; } = null!;

    public string AwbiValue { get; set; } = null!;

    public string? AwbiIssuer { get; set; }

    public DateOnly? AwbiIssueDate { get; set; }

    public DateOnly? AwbiExpiryDate { get; set; }

    public bool AwbiIsPrimary { get; set; }

    public string? AwbiSource { get; set; }

    public string? AwbiNotes { get; set; }

    public DateTime AwbiCreatedAt { get; set; }

    public virtual AwbHeader AwbiAwb { get; set; } = null!;

    public virtual SysAwbidentifierType AwbiIdentifierTypeNavigation { get; set; } = null!;
}
