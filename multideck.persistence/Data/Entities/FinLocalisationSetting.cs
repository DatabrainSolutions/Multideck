using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinLocalisationSetting
{
    public Guid FinlocSetId { get; set; }

    public Guid? FinlocSetLegalEntityId { get; set; }

    public Guid FinlocSetPackId { get; set; }

    public string? FinlocSetTaxRegistrationNo { get; set; }

    public string? FinlocSetReportingBasisCode { get; set; }

    public string FinlocSetSettingsJson { get; set; } = null!;

    public bool FinlocSetIsActive { get; set; }

    public virtual CmpLegalEntity? FinlocSetLegalEntity { get; set; }

    public virtual FinLocalisationPack FinlocSetPack { get; set; } = null!;
}
