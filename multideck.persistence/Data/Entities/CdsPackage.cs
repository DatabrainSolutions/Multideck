using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CdsPackage
{
    public Guid CdspkId { get; set; }

    public Guid CdspkCdsid { get; set; }

    public Guid? CdspkCdsitemId { get; set; }

    public string CdspkLevel { get; set; } = null!;

    public string? CdspkPackageTypeCode { get; set; }

    public int? CdspkNumberOfPackages { get; set; }

    public string? CdspkShippingMarks { get; set; }

    public DateTime CdspkCreatedAt { get; set; }

    public virtual CdsDeclaration CdspkCds { get; set; } = null!;

    public virtual CdsItem? CdspkCdsitem { get; set; }

    public virtual SysCustomsPackageLevel CdspkLevelNavigation { get; set; } = null!;
}
