using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CdsDataElement
{
    public Guid CdsdeId { get; set; }

    public Guid CdsdeCdsid { get; set; }

    public Guid? CdsdeCdsitemId { get; set; }

    public string? CdsdeGroupNumber { get; set; }

    public string CdsdeCode { get; set; } = null!;

    public string? CdsdeName { get; set; }

    public string CdsdeLevel { get; set; } = null!;

    public string? CdsdeValueText { get; set; }

    public string CdsdeValueJson { get; set; } = null!;

    public string? CdsdeSource { get; set; }

    public bool? CdsdeIsRequired { get; set; }

    public string? CdsdeValidationStatus { get; set; }

    public DateTime CdsdeCreatedAt { get; set; }

    public virtual CdsDeclaration CdsdeCds { get; set; } = null!;

    public virtual CdsItem? CdsdeCdsitem { get; set; }
}
