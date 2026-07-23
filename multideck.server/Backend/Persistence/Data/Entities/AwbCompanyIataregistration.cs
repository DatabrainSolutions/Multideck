using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

/// <summary>
/// Company IATA/CASS registrations and office snapshots for the company database.
/// </summary>
public partial class AwbCompanyIataregistration
{
    public Guid AwbcirId { get; set; }

    public Guid? AwbcirOrgId { get; set; }

    public Guid? AwbcirOrgOfficeId { get; set; }

    public string? AwbcirOfficeCodeSnapshot { get; set; }

    public string? AwbcirOfficeNameSnapshot { get; set; }

    public string AwbcirIatacodeSnapshot { get; set; } = null!;

    public string? AwbcirCassaccountNumberSnapshot { get; set; }

    public Guid? AwbcirCasscountryId { get; set; }

    public string? AwbcirCasscountryCodeSnapshot { get; set; }

    public Guid? AwbcirAirportId { get; set; }

    public string? AwbcirAirportCodeSnapshot { get; set; }

    public string? AwbcirLegalNameSnapshot { get; set; }

    public string AwbcirRegistrationStatus { get; set; } = null!;

    public DateOnly? AwbcirValidFrom { get; set; }

    public DateOnly? AwbcirValidTo { get; set; }

    public bool AwbcirIsDefault { get; set; }

    public bool AwbcirIsActive { get; set; }

    public string? AwbcirNotes { get; set; }

    public DateTime AwbcirCreatedAt { get; set; }

    public Guid? AwbcirCreatedBy { get; set; }

    public DateTime AwbcirUpdatedAt { get; set; }

    public Guid? AwbcirUpdatedBy { get; set; }

    public virtual ICollection<AwbHeader> AwbHeaders { get; set; } = new List<AwbHeader>();
}
