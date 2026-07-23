using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinLocalisationPack
{
    public Guid FinlocPackId { get; set; }

    public string FinlocPackCode { get; set; } = null!;

    public string FinlocPackName { get; set; } = null!;

    public string? FinlocPackCountryCode { get; set; }

    public string? FinlocPackAccountingStandardCode { get; set; }

    public bool FinlocPackIsActive { get; set; }

    public virtual ICollection<FinLocalisationSetting> FinLocalisationSettings { get; set; } = new List<FinLocalisationSetting>();
}
