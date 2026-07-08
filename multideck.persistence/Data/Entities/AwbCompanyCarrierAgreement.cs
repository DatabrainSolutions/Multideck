using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

/// <summary>
/// Company carrier/location activation settings for e-AWB and AWB message exchange.
/// </summary>
public partial class AwbCompanyCarrierAgreement
{
    public Guid AwbccaId { get; set; }

    public Guid? AwbccaOrgOfficeId { get; set; }

    public string? AwbccaOfficeCodeSnapshot { get; set; }

    public string? AwbccaOfficeNameSnapshot { get; set; }

    public Guid? AwbccaCarrierOrgId { get; set; }

    public string? AwbccaCarrierNameSnapshot { get; set; }

    public string? AwbccaCarrierIatacodeSnapshot { get; set; }

    public Guid? AwbccaAirportId { get; set; }

    public string? AwbccaAirportCodeSnapshot { get; set; }

    public bool AwbccaEawbenabled { get; set; }

    public string? AwbccaDefaultEawbcode { get; set; }

    public string AwbccaPreferredMessageStandard { get; set; } = null!;

    public string? AwbccaActivationNoticeReference { get; set; }

    public DateOnly? AwbccaActivationDate { get; set; }

    public DateOnly? AwbccaDeactivationDate { get; set; }

    public bool AwbccaRequiresPaperPouch { get; set; }

    public bool AwbccaRequiresCarrierAcknowledgement { get; set; }

    public Guid? AwbccaContactOrgId { get; set; }

    public string? AwbccaContactNameSnapshot { get; set; }

    public string? AwbccaContactEmailSnapshot { get; set; }

    public string? AwbccaNotes { get; set; }

    public bool AwbccaIsActive { get; set; }

    public DateTime AwbccaCreatedAt { get; set; }

    public Guid? AwbccaCreatedBy { get; set; }

    public DateTime AwbccaUpdatedAt { get; set; }

    public Guid? AwbccaUpdatedBy { get; set; }

    public virtual SysAwbspecialHandlingCode? AwbccaDefaultEawbcodeNavigation { get; set; }
}
